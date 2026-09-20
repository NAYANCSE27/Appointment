import { Worker, Job } from 'bullmq';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { CalendarSyncJobData, CalendarSyncJobResult } from '../queues/types';
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  buildCalendarEventData,
} from '../services/googleCalendar.service';

/**
 * Calendar sync worker
 * Processes jobs from the calendar-sync queue
 * Syncs appointments to Google Calendar (and Microsoft Calendar if configured)
 */
export function createCalendarSyncWorker() {
  const worker = new Worker<CalendarSyncJobData, CalendarSyncJobResult>(
    'calendar-sync',
    async (job: Job<CalendarSyncJobData>) => {
      const { appointmentId, action, tenantId } = job.data;

      logger.info('Processing calendar sync job', {
        jobId: job.id,
        appointmentId,
        action,
      });

      try {
        // Fetch appointment with all related data
        const appointment = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            provider: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            service: {
              select: {
                name: true,
              },
            },
            tenant: {
              select: {
                id: true,
                calendarSyncEnabled: true,
              },
            },
          },
        });

        if (!appointment) {
          throw new Error(`Appointment ${appointmentId} not found`);
        }

        // Check if calendar sync is enabled for tenant
        if (!appointment.tenant.calendarSyncEnabled) {
          logger.info('Calendar sync disabled for tenant, skipping', {
            tenantId,
            appointmentId,
          });
          return { success: true };
        }

        const eventData = buildCalendarEventData({
          service: appointment.service,
          patient: appointment.patient,
          provider: appointment.provider,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          patientTimezone: appointment.patientTimezone,
          bookingRef: appointment.bookingRef,
        });

        let googleEventId: string | undefined;
        let googleEventIdProvider: string | undefined;

        if (action === 'CREATE') {
          // Create event on patient's calendar if connected
          const patientEventId = await createGoogleCalendarEvent(
            appointment.patientId,
            eventData
          );

          // Create event on provider's calendar if connected
          const providerEventId = await createGoogleCalendarEvent(
            appointment.provider.userId,
            eventData
          );

          // Store event IDs in appointment
          if (patientEventId || providerEventId) {
            await prisma.appointment.update({
              where: { id: appointmentId },
              data: {
                googleEventId: patientEventId,
                googleEventIdProvider: providerEventId,
              },
            });
          }

          googleEventId = patientEventId || undefined;
          googleEventIdProvider = providerEventId || undefined;

          logger.info('Calendar events created', {
            appointmentId,
            patientEventId,
            providerEventId,
          });
        } else if (action === 'UPDATE') {
          // Update patient's calendar event
          if (appointment.googleEventId) {
            await updateGoogleCalendarEvent(
              appointment.patientId,
              appointment.googleEventId,
              eventData
            );
            googleEventId = appointment.googleEventId;
          }

          // Update provider's calendar event
          if (appointment.googleEventIdProvider) {
            await updateGoogleCalendarEvent(
              appointment.provider.userId,
              appointment.googleEventIdProvider,
              eventData
            );
            googleEventIdProvider = appointment.googleEventIdProvider;
          }

          logger.info('Calendar events updated', {
            appointmentId,
            googleEventId,
            googleEventIdProvider,
          });
        } else if (action === 'DELETE') {
          // Delete patient's calendar event
          if (appointment.googleEventId) {
            await deleteGoogleCalendarEvent(
              appointment.patientId,
              appointment.googleEventId
            );
          }

          // Delete provider's calendar event
          if (appointment.googleEventIdProvider) {
            await deleteGoogleCalendarEvent(
              appointment.provider.userId,
              appointment.googleEventIdProvider
            );
          }

          logger.info('Calendar events deleted', {
            appointmentId,
          });
        }

        return {
          success: true,
          googleEventId,
          googleEventIdProvider,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Calendar sync job failed', {
          jobId: job.id,
          appointmentId,
          action,
          error: errorMessage,
        });

        throw error;
      }
    },
    {
      connection: {
        host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname || 'localhost',
        port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port) || 6379,
      },
    }
  );

  // Event handlers
  worker.on('completed', (job) => {
    logger.info('Calendar sync worker completed job', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Calendar sync worker job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('Calendar sync worker error', { error: err.message });
  });

  return worker;
}

// Graceful shutdown helper
export async function closeCalendarSyncWorker(worker: Worker) {
  await worker.close();
  logger.info('Calendar sync worker closed');
}
