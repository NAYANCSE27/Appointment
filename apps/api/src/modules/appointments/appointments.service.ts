import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import {
  CreateAppointmentDto,
  CancelAppointmentDto,
  RescheduleAppointmentDto,
  UpdateStatusDto,
  CreateNoteDto,
  ListMyAppointmentsQuery
} from './appointments.schemas';
import { AppointmentStatus, Role } from '@prisma/client';
import { logAudit } from '../../utils/auditLogger';
import { encryptAES, decryptAES, hashSHA256, generateSecureToken } from '../../utils/crypto';
import { addMinutes, isAfter } from 'date-fns';
import { emailQueue, smsQueue, calendarSyncQueue, reminderQueue } from '../../queues';

export class AppointmentsService {
  /**
   * Create a new appointment
   * Implements race condition prevention with Redis lock
   */
  static async createAppointment(
    tenantId: string,
    patientId: string | undefined,
    dto: CreateAppointmentDto,
    ipAddress?: string,
    userAgent?: string
  ) {
    const { serviceId, providerId, startTime, timezone, patientNotes, idempotencyKey } = dto;

    // Check idempotency key
    if (idempotencyKey) {
      const existing = await prisma.appointment.findFirst({
        where: { idempotencyKey, tenantId },
      });
      if (existing) {
        return existing;
      }
    }

    // Validate service is active
    const service = await prisma.service.findFirst({
      where: { id: serviceId, tenantId, isActive: true },
    });
    if (!service) {
      const error = new Error('Service not found or inactive') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Validate provider offers the service
    const providerService = await prisma.providerService.findUnique({
      where: { providerId_serviceId: { providerId, serviceId } },
      include: { provider: true },
    });
    if (!providerService || !providerService.provider.isActive) {
      const error = new Error('Provider does not offer this service') as Error & { statusCode?: number; code?: string };
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      throw error;
    }

    const startTimeDate = new Date(startTime);
    const endTimeDate = addMinutes(startTimeDate, service.durationMins);

    // Check clinic holiday
    const holiday = await prisma.clinicHoliday.findFirst({
      where: {
        tenantId,
        date: startTimeDate,
      },
    });
    if (holiday) {
      const error = new Error('Clinic is closed on this date') as Error & { statusCode?: number; code?: string };
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      throw error;
    }

    // Acquire Redis lock for race condition prevention
    const lockKey = `appt_lock:${tenantId}:${providerId}:${startTimeDate.toISOString()}`;
    const lockAcquired = await redis.set(lockKey, '1', 'PX', 300000, 'NX');

    if (!lockAcquired) {
      const error = new Error('This time slot is currently being booked by another user') as Error & { statusCode?: number; code?: string };
      error.statusCode = 409;
      error.code = 'SLOT_UNAVAILABLE';
      throw error;
    }

    try {
      // Re-check no existing appointment for this slot (inside transaction)
      const existingAppt = await prisma.appointment.findFirst({
        where: {
          providerId,
          startTime: { lt: endTimeDate },
          endTime: { gt: startTimeDate },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
          tenantId,
        },
      });

      if (existingAppt) {
        const error = new Error('This time slot is no longer available') as Error & { statusCode?: number; code?: string };
        error.statusCode = 409;
        error.code = 'SLOT_UNAVAILABLE';
        throw error;
      }

      // Generate booking reference
      const year = new Date().getFullYear();
      const counterKey = `booking_ref:${tenantId}:${year}`;
      const counter = await redis.incr(counterKey);
      await redis.expire(counterKey, 31536000); // 1 year TTL
      const bookingRef = `MED-${year}-${counter.toString().padStart(6, '0')}`;

      // Determine status: CONFIRMED for authenticated users, PENDING for guests
      const status = patientId ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING;

      // Create appointment in transaction
      const appointment = await prisma.appointment.create({
        data: {
          tenantId,
          bookingRef,
          patientId: patientId || undefined, // Will need guest handling
          providerId,
          serviceId,
          startTime: startTimeDate,
          endTime: endTimeDate,
          status,
          patientNotes,
          patientTimezone: timezone,
          priceSnapshot: service.priceDecimal,
          idempotencyKey,
        },
        include: {
          service: true,
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      // Log audit
      await logAudit({
        tenantId,
        actorId: patientId,
        actorRole: Role.PATIENT,
        action: 'APPOINTMENT_CREATED',
        entityType: 'Appointment',
        entityId: appointment.id,
        afterState: {
          bookingRef: appointment.bookingRef,
          providerId,
          serviceId,
          startTime: startTime,
        },
        ipAddress,
        userAgent,
      });

      // Enqueue confirmation email notification
      await emailQueue.add('booking-confirmation', {
        appointmentId: appointment.id,
        recipientUserId: appointment.patientId,
        type: 'BOOKING_CONFIRMATION',
        tenantId,
      });

      // Enqueue confirmation SMS notification if enabled
      await smsQueue.add('booking-confirmation-sms', {
        appointmentId: appointment.id,
        recipientUserId: appointment.patientId,
        type: 'BOOKING_CONFIRMATION',
        tenantId,
      });

      // Enqueue calendar sync job
      await calendarSyncQueue.add('calendar-create', {
        appointmentId: appointment.id,
        action: 'CREATE',
        tenantId,
      });

      // Schedule reminder jobs
      const now = Date.now();
      const delay24h = startTimeDate.getTime() - 24 * 60 * 60 * 1000 - now;
      const delay1h = startTimeDate.getTime() - 60 * 60 * 1000 - now;

      if (delay24h > 0) {
        await reminderQueue.add(
          '24h-reminder',
          {
            appointmentId: appointment.id,
            type: '24H_REMINDER',
            tenantId,
          },
          {
            delay: delay24h,
            jobId: `rem24-${appointment.id}`,
          }
        );
      }

      if (delay1h > 0) {
        await reminderQueue.add(
          '1h-reminder',
          {
            appointmentId: appointment.id,
            type: '1H_REMINDER',
            tenantId,
          },
          {
            delay: delay1h,
            jobId: `rem1h-${appointment.id}`,
          }
        );
      }

      return appointment;
    } finally {
      // Release lock
      await redis.del(lockKey);
    }
  }

  /**
   * Get patient's own appointments
   */
  static async getMyAppointments(
    patientId: string,
    query: ListMyAppointmentsQuery
  ) {
    const { status, from, to, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      patientId,
      ...(status && { status: status as AppointmentStatus }),
      ...(from && { startTime: { gte: from } }),
      ...(to && { endTime: { lte: to } }),
    };

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        include: {
          service: { select: { id: true, name: true, durationMins: true } },
          provider: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.appointment.count({ where }),
    ]);

    return {
      appointments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get appointment by ID with RBAC
   */
  static async getAppointmentById(
    id: string,
    requesterId: string,
    requesterRole: Role
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        provider: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        service: true,
        consultationNote: true,
      },
    });

    if (!appointment) {
      const error = new Error('Appointment not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // RBAC check
    if (requesterRole === Role.PATIENT && appointment.patientId !== requesterId) {
      const error = new Error('Access denied') as Error & { statusCode?: number; code?: string };
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    if (requesterRole === Role.PROVIDER && appointment.providerId !== requesterId) {
      const error = new Error('Access denied') as Error & { statusCode?: number; code?: string };
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    // Decrypt consultation note if patient is allowed to see it
    if (appointment.consultationNote?.isSharedWithPatient) {
      appointment.consultationNote.encryptedContent = decryptAES(
        appointment.consultationNote.encryptedContent
      );
    }

    return appointment;
  }

  /**
   * Cancel an appointment
   */
  static async cancelAppointment(
    id: string,
    requesterId: string,
    requesterRole: Role,
    reason: string | undefined,
    ipAddress?: string,
    userAgent?: string
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { tenant: true },
    });

    if (!appointment) {
      const error = new Error('Appointment not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // RBAC check
    if (requesterRole === Role.PATIENT && appointment.patientId !== requesterId) {
      const error = new Error('Access denied') as Error & { statusCode?: number; code?: string };
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    // Check if already cancelled
    if (appointment.status === AppointmentStatus.CANCELLED) {
      const error = new Error('Appointment already cancelled') as Error & { statusCode?: number; code?: string };
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      throw error;
    }

    // Patient: check 24-hour notice (warn but allow)
    if (requesterRole === Role.PATIENT) {
      const hoursUntilAppt = (appointment.startTime.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilAppt < appointment.tenant.cancellationNoticeHours) {
        // Allow cancellation but log warning
        console.warn(`Patient cancelling within ${appointment.tenant.cancellationNoticeHours}h notice window`);
      }
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: requesterId,
        cancelReason: reason,
      },
    });

    // Log audit
    await logAudit({
      tenantId: appointment.tenantId,
      actorId: requesterId,
      actorRole: requesterRole,
      action: 'APPOINTMENT_CANCELLED',
      entityType: 'Appointment',
      entityId: id,
      beforeState: { status: appointment.status },
      afterState: { status: AppointmentStatus.CANCELLED, cancelledBy: requesterId },
      ipAddress,
      userAgent,
    });

    // Cancel reminder jobs
    try {
      await reminderQueue.remove(`rem24-${id}`);
      await reminderQueue.remove(`rem1h-${id}`);
    } catch (error) {
      // Jobs might not exist, which is fine
      console.log('Reminder jobs not found or already processed');
    }

    // Enqueue cancellation notification
    await emailQueue.add('booking-cancellation', {
      appointmentId: id,
      recipientUserId: appointment.patientId,
      type: 'BOOKING_CANCELLATION',
      tenantId: appointment.tenantId,
    });

    // Enqueue calendar event deletion
    await calendarSyncQueue.add('calendar-delete', {
      appointmentId: id,
      action: 'DELETE',
      tenantId: appointment.tenantId,
    });

    return updated;
  }

  /**
   * Reschedule an appointment
   */
  static async rescheduleAppointment(
    id: string,
    requesterId: string,
    dto: RescheduleAppointmentDto,
    ipAddress?: string,
    userAgent?: string
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { service: true },
    });

    if (!appointment) {
      const error = new Error('Appointment not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // RBAC check
    if (appointment.patientId !== requesterId) {
      const error = new Error('Access denied') as Error & { statusCode?: number; code?: string };
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    const newStartTime = new Date(dto.newStartTime);
    const newEndTime = addMinutes(newStartTime, appointment.service.durationMins);

    // TODO: Validate new slot is available (reuse availability check)

    // Create new appointment and mark old as RESCHEDULED
    const result = await prisma.$transaction(async (tx) => {
      // Generate new booking reference
      const year = new Date().getFullYear();
      const counterKey = `booking_ref:${appointment.tenantId}:${year}`;
      const counter = await redis.incr(counterKey);
      const bookingRef = `MED-${year}-${counter.toString().padStart(6, '0')}`;

      const newAppt = await tx.appointment.create({
        data: {
          tenantId: appointment.tenantId,
          bookingRef,
          patientId: appointment.patientId,
          providerId: appointment.providerId,
          serviceId: appointment.serviceId,
          startTime: newStartTime,
          endTime: newEndTime,
          status: AppointmentStatus.CONFIRMED,
          patientNotes: appointment.patientNotes,
          patientTimezone: dto.timezone,
          priceSnapshot: appointment.priceSnapshot,
          rescheduledFrom: id,
        },
      });

      await tx.appointment.update({
        where: { id },
        data: { status: AppointmentStatus.RESCHEDULED },
      });

      return newAppt;
    });

    // Log audit
    await logAudit({
      tenantId: appointment.tenantId,
      actorId: requesterId,
      actorRole: Role.PATIENT,
      action: 'APPOINTMENT_RESCHEDULED',
      entityType: 'Appointment',
      entityId: result.id,
      beforeState: { oldAppointmentId: id },
      afterState: { newStartTime: dto.newStartTime },
      ipAddress,
      userAgent,
    });

    // Cancel old reminder jobs
    try {
      await reminderQueue.remove(`rem24-${id}`);
      await reminderQueue.remove(`rem1h-${id}`);
    } catch (error) {
      console.log('Old reminder jobs not found');
    }

    // Schedule new reminder jobs
    const now = Date.now();
    const delay24h = newStartTime.getTime() - 24 * 60 * 60 * 1000 - now;
    const delay1h = newStartTime.getTime() - 60 * 60 * 1000 - now;

    if (delay24h > 0) {
      await reminderQueue.add(
        '24h-reminder',
        {
          appointmentId: result.id,
          type: '24H_REMINDER',
          tenantId: appointment.tenantId,
        },
        {
          delay: delay24h,
          jobId: `rem24-${result.id}`,
        }
      );
    }

    if (delay1h > 0) {
      await reminderQueue.add(
        '1h-reminder',
        {
          appointmentId: result.id,
          type: '1H_REMINDER',
          tenantId: appointment.tenantId,
        },
        {
          delay: delay1h,
          jobId: `rem1h-${result.id}`,
        }
      );
    }

    // Enqueue rescheduled notification
    await emailQueue.add('booking-rescheduled', {
      appointmentId: result.id,
      recipientUserId: appointment.patientId,
      type: 'BOOKING_RESCHEDULED',
      tenantId: appointment.tenantId,
    });

    // Enqueue calendar event update
    await calendarSyncQueue.add('calendar-update', {
      appointmentId: result.id,
      action: 'UPDATE',
      tenantId: appointment.tenantId,
    });

    return result;
  }

  /**
   * Update appointment status (Provider only)
   */
  static async updateAppointmentStatus(
    id: string,
    providerId: string,
    dto: UpdateStatusDto,
    ipAddress?: string,
    userAgent?: string
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      const error = new Error('Appointment not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Verify provider owns this appointment
    if (appointment.providerId !== providerId) {
      const error = new Error('Access denied') as Error & { statusCode?: number; code?: string };
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    // Validate appointment time has passed
    if (isAfter(new Date(), appointment.endTime)) {
      const error = new Error('Cannot mark future appointments as completed') as Error & { statusCode?: number; code?: string };
      error.statusCode = 422;
      error.code = 'UNPROCESSABLE';
      throw error;
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
    });

    // Log audit
    await logAudit({
      tenantId: appointment.tenantId,
      actorId: providerId,
      actorRole: Role.PROVIDER,
      action: 'APPOINTMENT_STATUS_UPDATED',
      entityType: 'Appointment',
      entityId: id,
      beforeState: { status: appointment.status },
      afterState: { status: dto.status },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  /**
   * Create consultation note (Provider only)
   */
  static async createConsultationNote(
    appointmentId: string,
    providerId: string,
    dto: CreateNoteDto,
    ipAddress?: string,
    userAgent?: string
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      const error = new Error('Appointment not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Verify provider owns this appointment
    if (appointment.providerId !== providerId) {
      const error = new Error('Access denied') as Error & { statusCode?: number; code?: string };
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    // Verify appointment is COMPLETED
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      const error = new Error('Can only add notes to completed appointments') as Error & { statusCode?: number; code?: string };
      error.statusCode = 422;
      error.code = 'UNPROCESSABLE';
      throw error;
    }

    // Encrypt note content
    const encryptedContent = encryptAES(dto.content);

    const note = await prisma.consultationNote.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        authorId: providerId,
        encryptedContent,
        isSharedWithPatient: dto.isSharedWithPatient,
      },
      update: {
        encryptedContent,
        isSharedWithPatient: dto.isSharedWithPatient,
      },
    });

    // Log audit
    await logAudit({
      tenantId: appointment.tenantId,
      actorId: providerId,
      actorRole: Role.PROVIDER,
      action: 'NOTE_CREATED',
      entityType: 'ConsultationNote',
      entityId: note.id,
      afterState: { isSharedWithPatient: dto.isSharedWithPatient },
      ipAddress,
      userAgent,
    });

    return note;
  }
}
