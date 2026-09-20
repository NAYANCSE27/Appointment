import { Worker, Job } from 'bullmq';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { emailQueue } from '../queues';
import { EmailJobData, EmailJobResult } from '../queues/types';
import { sendEmail, compileTemplate, getTemplateVariables } from '../services/email.service';

/**
 * Email notification worker
 * Processes jobs from the email-notifications queue
 */
export function createEmailWorker() {
  const worker = new Worker<EmailJobData, EmailJobResult>(
    'email-notifications',
    async (job: Job<EmailJobData>) => {
      const { appointmentId, recipientUserId, type, tenantId } = job.data;

      logger.info('Processing email job', {
        jobId: job.id,
        appointmentId,
        type,
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
                phone: true,
              },
            },
            provider: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
            service: {
              select: {
                name: true,
                durationMins: true,
              },
            },
            tenant: {
              select: {
                id: true,
                name: true,
                address: true,
                phone: true,
              },
            },
          },
        });

        if (!appointment) {
          throw new Error(`Appointment ${appointmentId} not found`);
        }

        // Fetch notification template
        const template = await prisma.notificationTemplate.findUnique({
          where: {
            tenantId_type_channel: {
              tenantId,
              type,
              channel: 'EMAIL',
            },
          },
        });

        if (!template || !template.bodyHtml) {
          throw new Error(`Email template not found for type ${type}`);
        }

        // Build template variables
        const variables = getTemplateVariables({
          patient: appointment.patient,
          provider: {
            firstName: appointment.provider.user.firstName,
            lastName: appointment.provider.user.lastName,
            specialty: appointment.provider.specialty,
          },
          service: appointment.service,
          appointment: {
            startTime: appointment.startTime,
            bookingRef: appointment.bookingRef,
            patientTimezone: appointment.patientTimezone,
          },
          tenant: appointment.tenant,
        });

        // Compile template
        const htmlBody = compileTemplate(template.bodyHtml, variables);
        const textBody = template.bodySms
          ? compileTemplate(template.bodySms, variables)
          : undefined;

        // Send email
        const result = await sendEmail({
          to: appointment.patient.email,
          subject: template.subject || `MediBook: ${type}`,
          htmlBody,
          textBody,
        });

        // Update AppointmentNotification record
        const notification = await prisma.appointmentNotification.findFirst({
          where: {
            appointmentId,
            type,
            channel: 'EMAIL',
            recipientUserId,
          },
        });

        if (notification) {
          await prisma.appointmentNotification.update({
            where: { id: notification.id },
            data: {
              status: result.success ? 'COMPLETED' : 'FAILED',
              sentAt: result.success ? new Date() : undefined,
              externalId: result.messageId,
              failureReason: result.error,
            },
          });
        } else {
          // Create notification record if it doesn't exist
          await prisma.appointmentNotification.create({
            data: {
              appointmentId,
              type,
              channel: 'EMAIL',
              recipientUserId,
              status: result.success ? 'COMPLETED' : 'FAILED',
              scheduledFor: new Date(),
              sentAt: result.success ? new Date() : undefined,
              externalId: result.messageId,
              failureReason: result.error,
            },
          });
        }

        if (!result.success) {
          throw new Error(result.error || 'Failed to send email');
        }

        logger.info('Email job completed', {
          jobId: job.id,
          appointmentId,
          messageId: result.messageId,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Email job failed', {
          jobId: job.id,
          appointmentId,
          error: errorMessage,
        });

        // Update notification record with failure
        try {
          await prisma.appointmentNotification.updateMany({
            where: {
              appointmentId,
              type,
              channel: 'EMAIL',
              recipientUserId,
            },
            data: {
              status: 'FAILED',
              failureReason: errorMessage,
            },
          });
        } catch (updateError) {
          logger.error('Failed to update notification record', {
            appointmentId,
            error: updateError,
          });
        }

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
    logger.info('Email worker completed job', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Email worker job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('Email worker error', { error: err.message });
  });

  return worker;
}

// Graceful shutdown helper
export async function closeEmailWorker(worker: Worker) {
  await worker.close();
  logger.info('Email worker closed');
}
