import { prisma } from '../../config/prisma';
import { AvailabilityQuery } from './availability.schemas';
import { DayOfWeek, AppointmentStatus } from '@prisma/client';
import {
  parseISO,
  format,
  addMinutes,
  addDays,
  differenceInDays,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

interface TimeSlot {
  startUtc: Date;
  endUtc: Date;
  startLocal: string;
  endLocal: string;
  displayTime: string;
}

interface ProviderSlots {
  providerId: string;
  providerName: string;
  providerPhotoUrl: string | null;
  date: string;
  times: TimeSlot[];
}

export class AvailabilityService {
  /**
   * Get available slots for a service within a date range
   * Follows the algorithm from SYSTEM_ARCHITECTURE_DATA.md Section 6
   */
  static async getAvailableSlots(
    tenantId: string,
    query: AvailabilityQuery
  ): Promise<{
    serviceId: string;
    serviceDurationMins: number;
    timezone: string;
    slots: ProviderSlots[];
  }> {
    const { serviceId, providerId, startDate, endDate, timezone } = query;

    // Step 1: Fetch service
    const service = await prisma.service.findFirst({
      where: { id: serviceId, tenantId, isActive: true },
    });

    if (!service) {
      const error = new Error('Service not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Step 2: Fetch providers
    const providers = providerId
      ? await prisma.provider.findMany({
          where: { id: providerId, tenantId, isActive: true },
        })
      : await prisma.provider.findMany({
          where: {
            tenantId,
            isActive: true,
            services: { some: { serviceId } },
          },
        });

    if (providers.length === 0) {
      return {
        serviceId,
        serviceDurationMins: service.durationMins,
        timezone,
        slots: [],
      };
    }

    // Parse dates
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    // Step 3: Pre-fetch blocking data (per provider, in parallel)
    const providerData = await Promise.all(
      providers.map(async (provider) => {
        const [weeklySchedules, exceptions, existingAppointments] = await Promise.all([
          prisma.providerWeeklySchedule.findMany({
            where: { providerId: provider.id, isActive: true },
          }),
          prisma.providerException.findMany({
            where: {
              providerId: provider.id,
              startDate: { lte: end },
              endDate: { gte: start },
            },
          }),
          prisma.appointment.findMany({
            where: {
              providerId: provider.id,
              startTime: { gte: start, lt: addDays(end, 1) },
              status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
            },
          }),
        ]);

        return {
          provider,
          weeklySchedules,
          exceptions,
          existingAppointments,
        };
      })
    );

    // Step 4: Pre-fetch tenant holidays
    const holidays = await prisma.clinicHoliday.findMany({
      where: {
        tenantId,
        date: { gte: start, lte: end },
      },
    });
    const holidayDates = new Set(
      holidays.map((h) => format(h.date, 'yyyy-MM-dd'))
    );

    // Step 5: Generate slots
    const allSlots: ProviderSlots[] = [];

    for (const { provider, weeklySchedules, exceptions, existingAppointments } of providerData) {
      const user = await prisma.user.findUnique({
        where: { id: provider.userId },
        select: { firstName: true, lastName: true, profilePhotoUrl: true },
      });

      const providerName = user ? `Dr. ${user.firstName} ${user.lastName}` : 'Unknown Provider';
      const slotsByDate = new Map<string, TimeSlot[]>();

      const daysInRange = differenceInDays(end, start) + 1;

      for (let i = 0; i < daysInRange; i++) {
        const currentDate = addDays(start, i);
        const dateStr = format(currentDate, 'yyyy-MM-dd');

        // Skip holidays
        if (holidayDates.has(dateStr)) continue;

        const dayOfWeek = this.getDayOfWeek(currentDate);
        const daySchedules = weeklySchedules.filter((s) => s.dayOfWeek === dayOfWeek);

        if (daySchedules.length === 0) continue;

        for (const schedule of daySchedules) {
          // Parse schedule times
          const [startHour, startMin] = schedule.startTime.split(':').map(Number);
          const [endHour, endMin] = schedule.endTime.split(':').map(Number);

          let cursor = new Date(currentDate);
          cursor.setHours(startHour, startMin, 0, 0);

          const windowEnd = new Date(currentDate);
          windowEnd.setHours(endHour, endMin, 0, 0);

          // Convert to UTC for internal processing
          let cursorUtc = toZonedTime(cursor, timezone);
          let windowEndUtc = toZonedTime(windowEnd, timezone);

          while (isBefore(addMinutes(cursorUtc, service.durationMins), windowEndUtc) ||
                 addMinutes(cursorUtc, service.durationMins).getTime() === windowEndUtc.getTime()) {
            const slotStart = cursorUtc;
            const slotEnd = addMinutes(cursorUtc, service.durationMins);

            // Check if slot is available
            const isExcepted = this.isSlotExcepted(slotStart, slotEnd, exceptions, timezone);
            const isBooked = this.isSlotBooked(slotStart, slotEnd, existingAppointments, provider.appointmentBuffer);
            const isTooSoon = this.isTooSoon(slotStart, provider.minimumNoticeHours);
            const isPast = isBefore(slotStart, new Date());

            if (!isExcepted && !isBooked && !isTooSoon && !isPast) {
              const slotLocal = formatInTimeZone(slotStart, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
              const slotEndLocal = formatInTimeZone(slotEnd, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
              const displayTime = formatInTimeZone(slotStart, timezone, 'h:mm a');

              const slot: TimeSlot = {
                startUtc: slotStart,
                endUtc: slotEnd,
                startLocal: slotLocal,
                endLocal: slotEndLocal,
                displayTime,
              };

              if (!slotsByDate.has(dateStr)) {
                slotsByDate.set(dateStr, []);
              }
              slotsByDate.get(dateStr)!.push(slot);
            }

            // Move cursor by slot duration + buffer
            cursorUtc = addMinutes(cursorUtc, service.durationMins + provider.appointmentBuffer);
          }
        }
      }

      // Convert map to array
      for (const [date, times] of slotsByDate) {
        allSlots.push({
          providerId: provider.id,
          providerName,
          providerPhotoUrl: user?.profilePhotoUrl || null,
          date,
          times,
        });
      }
    }

    return {
      serviceId,
      serviceDurationMins: service.durationMins,
      timezone,
      slots: allSlots,
    };
  }

  private static getDayOfWeek(date: Date): DayOfWeek {
    const days: DayOfWeek[] = [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];
    return days[date.getDay()];
  }

  private static isSlotExcepted(
    slotStart: Date,
    slotEnd: Date,
    exceptions: { startDate: Date; endDate: Date; startTime: string | null; endTime: string | null }[],
    timezone: string
  ): boolean {
    for (const ex of exceptions) {
      const exStart = startOfDay(ex.startDate);
      const exEnd = endOfDay(ex.endDate);

      if (ex.startTime && ex.endTime) {
        // Partial day exception
        const [startH, startM] = ex.startTime.split(':').map(Number);
        const [endH, endM] = ex.endTime.split(':').map(Number);

        const exceptionStart = new Date(ex.startDate);
        exceptionStart.setHours(startH, startM, 0, 0);

        const exceptionEnd = new Date(ex.endDate);
        exceptionEnd.setHours(endH, endM, 0, 0);

        if (slotStart < exceptionEnd && slotEnd > exceptionStart) {
          return true;
        }
      } else {
        // All-day exception
        if (slotStart < exEnd && slotEnd > exStart) {
          return true;
        }
      }
    }
    return false;
  }

  private static isSlotBooked(
    slotStart: Date,
    slotEnd: Date,
    appointments: { startTime: Date; endTime: Date }[],
    bufferMins: number
  ): boolean {
    for (const appt of appointments) {
      const bufferedStart = addMinutes(appt.startTime, -bufferMins);
      const bufferedEnd = addMinutes(appt.endTime, bufferMins);

      if (slotStart < bufferedEnd && slotEnd > bufferedStart) {
        return true;
      }
    }
    return false;
  }

  private static isTooSoon(slotStart: Date, minimumNoticeHours: number): boolean {
    const minStartTime = addMinutes(new Date(), minimumNoticeHours * 60);
    return isBefore(slotStart, minStartTime);
  }
}
