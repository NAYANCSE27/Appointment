import { prisma } from '../../config/prisma';
import {
  UpdateScheduleDto,
  CreateExceptionDto,
  ListProvidersQuery,
  ListExceptionsQuery,
  ListProviderAppointmentsQuery
} from './providers.schemas';
import { DayOfWeek, AppointmentStatus } from '@prisma/client';

export class ProvidersService {
  /**
   * List active providers for public booking
   */
  static async listProviders(tenantId: string, query: ListProvidersQuery) {
    const { serviceId, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      isActive: true,
      ...(serviceId && {
        services: { some: { serviceId } },
      }),
    };

    const [providers, total] = await Promise.all([
      prisma.provider.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profilePhotoUrl: true,
            },
          },
          services: {
            include: {
              service: {
                select: { id: true, name: true, category: true },
              },
            },
          },
        },
        orderBy: { user: { firstName: 'asc' } },
      }),
      prisma.provider.count({ where }),
    ]);

    return {
      providers: providers.map((p) => ({
        id: p.id,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        profilePhotoUrl: p.user.profilePhotoUrl,
        specialty: p.specialty,
        bio: p.bio,
        services: p.services.map((ps) => ps.service),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get provider public profile
   */
  static async getProviderPublicProfile(tenantId: string, providerId: string) {
    const provider = await prisma.provider.findFirst({
      where: {
        id: providerId,
        tenantId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePhotoUrl: true,
          },
        },
        services: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!provider) {
      const error = new Error('Provider not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    return {
      id: provider.id,
      firstName: provider.user.firstName,
      lastName: provider.user.lastName,
      profilePhotoUrl: provider.user.profilePhotoUrl,
      specialty: provider.specialty,
      bio: provider.bio,
      appointmentBuffer: provider.appointmentBuffer,
      minimumNoticeHours: provider.minimumNoticeHours,
      services: provider.services.map((ps) => ps.service),
    };
  }

  /**
   * Get provider's weekly schedule
   */
  static async getMySchedule(providerId: string) {
    const schedules = await prisma.providerWeeklySchedule.findMany({
      where: { providerId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return schedules;
  }

  /**
   * Update provider's weekly schedule (REPLACE strategy)
   */
  static async updateMySchedule(providerId: string, data: UpdateScheduleDto) {
    // Validate no overlapping windows on same day
    for (const schedule of data.schedules) {
      const windows = schedule.windows;
      for (let i = 0; i < windows.length; i++) {
        for (let j = i + 1; j < windows.length; j++) {
          if (this.windowsOverlap(windows[i], windows[j])) {
            const error = new Error(`Overlapping windows detected on ${schedule.dayOfWeek}`) as Error & { statusCode?: number; code?: string };
            error.statusCode = 400;
            error.code = 'VALIDATION_ERROR';
            throw error;
          }
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      // Delete existing schedules
      await tx.providerWeeklySchedule.deleteMany({
        where: { providerId },
      });

      // Insert new schedules
      for (const schedule of data.schedules) {
        for (const window of schedule.windows) {
          await tx.providerWeeklySchedule.create({
            data: {
              providerId,
              dayOfWeek: schedule.dayOfWeek,
              startTime: window.startTime,
              endTime: window.endTime,
              isActive: true,
            },
          });
        }
      }

      // Update provider settings
      await tx.provider.update({
        where: { id: providerId },
        data: {
          appointmentBuffer: data.appointmentBuffer,
          minimumNoticeHours: data.minimumNoticeHours,
        },
      });
    });

    return this.getMySchedule(providerId);
  }

  /**
   * Check if two time windows overlap
   */
  private static windowsOverlap(
    a: { startTime: string; endTime: string },
    b: { startTime: string; endTime: string }
  ): boolean {
    return a.startTime < b.endTime && a.endTime > b.startTime;
  }

  /**
   * Get provider's exceptions
   */
  static async getMyExceptions(providerId: string, query: ListExceptionsQuery) {
    const { from, to } = query;

    const where = {
      providerId,
      ...(from && to && {
        startDate: { lte: to },
        endDate: { gte: from },
      }),
    };

    const exceptions = await prisma.providerException.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });

    return exceptions;
  }

  /**
   * Create a new exception
   */
  static async createException(providerId: string, data: CreateExceptionDto) {
    // Check for conflicts with confirmed appointments (warn but don't block)
    const conflicts = await prisma.appointment.findMany({
      where: {
        providerId,
        status: AppointmentStatus.CONFIRMED,
        startTime: { lt: data.endDate },
        endTime: { gt: data.startDate },
      },
      take: 5,
    });

    if (conflicts.length > 0) {
      // Log warning but don't block
      console.warn(
        `Creating exception that conflicts with ${conflicts.length} confirmed appointment(s)`
      );
    }

    const exception = await prisma.providerException.create({
      data: {
        providerId,
        type: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        startTime: data.startTime,
        endTime: data.endTime,
        reason: data.reason,
      },
    });

    return exception;
  }

  /**
   * Delete an exception (must be in the future)
   */
  static async deleteException(providerId: string, exceptionId: string) {
    const exception = await prisma.providerException.findFirst({
      where: { id: exceptionId, providerId },
    });

    if (!exception) {
      const error = new Error('Exception not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    if (exception.endDate < new Date()) {
      const error = new Error('Cannot delete past exceptions') as Error & { statusCode?: number; code?: string };
      error.statusCode = 422;
      error.code = 'UNPROCESSABLE';
      throw error;
    }

    await prisma.providerException.delete({
      where: { id: exceptionId },
    });

    return { success: true };
  }

  /**
   * Get provider's appointments
   */
  static async getMyAppointments(
    providerId: string,
    query: ListProviderAppointmentsQuery
  ) {
    const { status, from, to, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      providerId,
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
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          service: {
            select: { id: true, name: true, durationMins: true },
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
}
