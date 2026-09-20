import { Worker, Job } from 'bullmq';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { ReminderJobData, ReminderJobResult } from '../queues/types';
import { emailQueue, smsQueue } from '../queues';
import { NotificationType } from '@prisma/client';

/**
 * Reminder worker
 * Processes delayed jobs from the scheduled-reminders queue
 * Sends 24h and 1h reminders before appointments
 */
export function createReminderWorker() {
  const worker = new Worker<ReminderJobData, ReminderJobResult>(
    'scheduled-reminders',
    async (job: Job<ReminderJobData>) => {
      const { appointmentId, type, tenantId } = job.data;

      logger.info('Processing reminder job', {
        jobId: job.id,
        appointmentId,
        type,
      });

      try {
        // Fetch appointment
        const appointment = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          include: {
            patient: {
              select: {
                id: true,
                notifyBySms: true,
              },
            },
          },
        });

        if (!appointment) {
          logger.warn('Appointment not found for reminder, skipping', {
            appointmentId,
          });
          return { success: true };
        }

        // Skip if appointment is cancelled or completed
        if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
          logger.info('Appointment is no longer active, skipping reminder', {
            appointmentId,
            status: appointment.status,
          });
          return { success: true };
        }

        // Determine notification type based on reminder type
        const notificationType: NotificationType =
          type === '24H_REMINDER'
            ? 'BOOKING_REMINDER_24H'
            : 'BOOKING_REMINDER_1H';

        // Enqueue email job
        const emailJob = await emailQueue.add(
          `reminder-email-${appointmentId}`,
          {
            appointmentId,
            recipientUserId: appointment.patientId,
            type: notificationType,
            tenantId,
          },
          {
            jobId: `email-${type.toLowerCase()}-${appointmentId}`,
          }
        );

        logger.info('Email reminder job enqueued', {
          appointmentId,
          emailJobId: emailJob.id,
        });

        // Enqueue SMS job if enabled for patient
        let smsJobId: string | undefined;
        if (appointment.patient.notifyBySms) {
          const smsJob = await smsQueue.add(
            `reminder-sms-${appointmentId}`,
            {
              appointmentId,
              recipientUserId: appointment.patientId,
              type: notificationType,
              tenantId,
            },
            {
              jobId: `sms-${type.toLowerCase()}-${appointmentId}`,
            }
          );
          smsJobId = smsJob.id;

          logger.info('SMS reminder job enqueued', {
            appointmentId,
            smsJobId,
          });
        }

        return {
          success: true,
          emailJobId: emailJob.id,
          smsJobId,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Reminder job failed', {
          jobId: job.id,
          appointmentId,
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
    logger.info('Reminder worker completed job', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Reminder worker job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('Reminder worker error', { error: err.message });
  });

  return worker;
}

// Graceful shutdown helper
export async function closeReminderWorker(worker: Worker) {
  await worker.close();
  logger.info('Reminder worker closed');
}
