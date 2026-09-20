import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { logger } from '../../utils/logger';
import { startOfDay, endOfDay, differenceInHours } from 'date-fns';

interface AnalyticsQuery {
  tenantId: string;
  from: Date;
  to: Date;
}

interface AnalyticsResult {
  period: { from: string; to: string };
  kpis: {
    totalAppointments: number;
    confirmedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    completedAppointments: number;
    cancellationRate: number;
    noShowRate: number;
    averageBookingLeadTimeHours: number;
  };
  appointmentsByDay: Array<{ date: string; count: number }>;
  appointmentsByService: Array<{ serviceId: string; serviceName: string; count: number }>;
  topProviders: Array<{
    providerId: string;
    providerName: string;
    appointmentCount: number;
    utilizationRate: number;
  }>;
}

export class AnalyticsService {
  /**
   * Get analytics for a date range
   * Cached in Redis for 60 seconds
   */
  static async getAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult> {
    const { tenantId, from, to } = query;

    // Validate date range (max 365 days)
    const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      const error = new Error('Date range cannot exceed 365 days') as Error & { statusCode?: number; code?: string };
      error.statusCode = 400;
      error.code = 'BAD_REQUEST';
      throw error;
    }

    // Check cache
    const cacheKey = `analytics:${tenantId}:${from.toISOString()}:${to.toISOString()}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info('Analytics cache hit', { tenantId });
      return JSON.parse(cached);
    }

    logger.info('Computing analytics', { tenantId, from, to });

    // Fetch all appointments in the date range
    const appointments = await prisma.appointment.findMany({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
      },
      include: {
        service: { select: { id: true, name: true } },
        provider: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    // Calculate KPIs
    const totalAppointments = appointments.length;
    const confirmedAppointments = appointments.filter((a) => a.status === 'CONFIRMED').length;
    const cancelledAppointments = appointments.filter((a) => a.status === 'CANCELLED').length;
    const noShowAppointments = appointments.filter((a) => a.status === 'NO_SHOW').length;
    const completedAppointments = appointments.filter((a) => a.status === 'COMPLETED').length;

    const cancellationRate = totalAppointments > 0 ? (cancelledAppointments / totalAppointments) * 100 : 0;
    const noShowRate = totalAppointments > 0 ? (noShowAppointments / totalAppointments) * 100 : 0;

    // Calculate average booking lead time
    const leadTimes = appointments
      .filter((a) => a.status === 'CONFIRMED' || a.status === 'COMPLETED')
      .map((a) => differenceInHours(a.startTime, a.createdAt));
    const averageBookingLeadTimeHours =
      leadTimes.length > 0 ? leadTimes.reduce((sum, t) => sum + t, 0) / leadTimes.length : 0;

    // Appointments by day
    const appointmentsByDayMap = new Map<string, number>();
    appointments.forEach((appt) => {
      const dateStr = appt.startTime.toISOString().split('T')[0];
      appointmentsByDayMap.set(dateStr, (appointmentsByDayMap.get(dateStr) || 0) + 1);
    });
    const appointmentsByDay = Array.from(appointmentsByDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Appointments by service
    const appointmentsByServiceMap = new Map<string, { serviceId: string; serviceName: string; count: number }>();
    appointments.forEach((appt) => {
      const existing = appointmentsByServiceMap.get(appt.serviceId);
      if (existing) {
        existing.count++;
      } else {
        appointmentsByServiceMap.set(appt.serviceId, {
          serviceId: appt.serviceId,
          serviceName: appt.service.name,
          count: 1,
        });
      }
    });
    const appointmentsByService = Array.from(appointmentsByServiceMap.values()).sort(
      (a, b) => b.count - a.count
    );

    // Top providers
    const providerStatsMap = new Map<
      string,
      { providerId: string; providerName: string; appointmentCount: number; totalDurationMins: number }
    >();

    appointments.forEach((appt) => {
      const existing = providerStatsMap.get(appt.providerId);
      const durationMins = Math.round((appt.endTime.getTime() - appt.startTime.getTime()) / (1000 * 60));

      if (existing) {
        existing.appointmentCount++;
        existing.totalDurationMins += durationMins;
      } else {
        providerStatsMap.set(appt.providerId, {
          providerId: appt.providerId,
          providerName: `Dr. ${appt.provider.user.firstName} ${appt.provider.user.lastName}`,
          appointmentCount: 1,
          totalDurationMins: durationMins,
        });
      }
    });

    // Calculate utilization rates
    // Simplified: assume 8-hour workday (480 minutes) for each business day in the period
    const businessDays = Math.ceil(daysDiff * 0.71); // Approximate Mon-Fri
    const totalWorkingMinutesPerProvider = businessDays * 480;

    const topProviders = Array.from(providerStatsMap.values())
      .map((stats) => ({
        providerId: stats.providerId,
        providerName: stats.providerName,
        appointmentCount: stats.appointmentCount,
        utilizationRate: (stats.totalDurationMins / totalWorkingMinutesPerProvider) * 100,
      }))
      .sort((a, b) => b.appointmentCount - a.appointmentCount)
      .slice(0, 5);

    const result: AnalyticsResult = {
      period: { from: from.toISOString(), to: to.toISOString() },
      kpis: {
        totalAppointments,
        confirmedAppointments,
        cancelledAppointments,
        noShowAppointments,
        completedAppointments,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        noShowRate: Math.round(noShowRate * 10) / 10,
        averageBookingLeadTimeHours: Math.round(averageBookingLeadTimeHours * 10) / 10,
      },
      appointmentsByDay,
      appointmentsByService,
      topProviders: topProviders.map((p) => ({
        ...p,
        utilizationRate: Math.round(p.utilizationRate * 10) / 10,
      })),
    };

    // Cache for 60 seconds
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);

    return result;
  }
}
