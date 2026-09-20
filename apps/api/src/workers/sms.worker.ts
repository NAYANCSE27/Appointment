import { Worker, Job } from 'bullmq';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { SmsJobData, SmsJobResult } from '../queues/types';
import { sendSms, validateSmsLength } from '../services/sms.service';
import Handlebars from 'handlebars';

/**
 * SMS notification worker
 * Processes jobs from the sms-notifications queue
 */
export function createSmsWorker() {
  const worker = new Worker<SmsJobData, SmsJobResult>(
    'sms-notifications',
    async (job: Job<SmsJobData>) => {
      const { appointmentId, recipientUserId, type, tenantId } = job.data;

      logger.info('Processing SMS job', {
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
                notifyBySms: true,
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
                smsEnabled: true,
              },
            },
          },
        });

        if (!appointment) {
          throw new Error(`Appointment ${appointmentId} not found`);
        }

        // Check if SMS is enabled for tenant
        if (!appointment.tenant.smsEnabled) {
          logger.info('SMS disabled for tenant, marking job as completed', {
            tenantId,
            appointmentId,
          });

          // Update notification record
          await prisma.appointmentNotification.updateMany({
            where: {
              appointmentId,
              type,
              channel: 'SMS',
              recipientUserId,
            },
            data: {
              status: 'COMPLETED',
              failureReason: 'SMS disabled for tenant',
            },
          });

          return { success: true };
        }

        // Check user's SMS preference
        if (!appointment.patient.notifyBySms) {
          logger.info('User opted out of SMS, marking job as completed', {
            userId: appointment.patient.id,
            appointmentId,
          });

          // Update notification record
          await prisma.appointmentNotification.updateMany({
            where: {
              appointmentId,
              type,
              channel: 'SMS',
              recipientUserId,
            },
            data: {
              status: 'COMPLETED',
              failureReason: 'User opted out of SMS notifications',
            },
          });

          return { success: true };
        }

        // Check if patient has a phone number
        if (!appointment.patient.phone) {
          logger.warn('Patient has no phone number, marking job as completed', {
            userId: appointment.patient.id,
            appointmentId,
          });

          await prisma.appointmentNotification.updateMany({
            where: {
              appointmentId,
              type,
              channel: 'SMS',
              recipientUserId,
            },
            data: {
              status: 'COMPLETED',
              failureReason: 'No phone number on file',
            },
          });

          return { success: true };
        }

        // Fetch notification template
        const template = await prisma.notificationTemplate.findUnique({
          where: {
            tenantId_type_channel: {
              tenantId,
              type,
              channel: 'SMS',
            },
          },
        });

        if (!template || !template.bodySms) {
          throw new Error(`SMS template not found for type ${type}`);
        }

        // Build template variables
        const appointmentDate = appointment.startTime.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: appointment.patientTimezone,
        });

        const appointmentTime = appointment.startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: appointment.patientTimezone,
        });

        const variables = {
          patientFirstName: appointment.patient.firstName,
          patientLastName: appointment.patient.lastName,
          providerName: `Dr. ${appointment.provider.user.firstName} ${appointment.provider.user.lastName}`,
          serviceName: appointment.service.name,
          appointmentDate,
          appointmentTime,
          bookingRef: appointment.bookingRef,
          clinicName: appointment.tenant.name,
        };

        // Compile template
        const compiledTemplate = Handlebars.compile(template.bodySms);
        const smsBody = compiledTemplate(variables);

        // Validate SMS length
        const lengthCheck = validateSmsLength(smsBody);
        if (lengthCheck.warning) {
          logger.warn('SMS body exceeds 160 characters', {
            length: lengthCheck.length,
            warning: lengthCheck.warning,
          });
        }

        // Send SMS
        const result = await sendSms({
          to: appointment.patient.phone,
          body: smsBody,
        });

        // Update AppointmentNotification record
        await prisma.appointmentNotification.updateMany({
          where: {
            appointmentId,
            type,
            channel: 'SMS',
            recipientUserId,
          },
          data: {
            status: result.success ? 'COMPLETED' : 'FAILED',
            sentAt: result.success ? new Date() : undefined,
            externalId: result.messageId,
            failureReason: result.error,
          },
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to send SMS');
        }

        logger.info('SMS job completed', {
          jobId: job.id,
          appointmentId,
          messageId: result.messageId,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('SMS job failed', {
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
              channel: 'SMS',
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
    logger.info('SMS worker completed job', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('SMS worker job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error('SMS worker error', { error: err.message });
  });

  return worker;
}

// Graceful shutdown helper
export async function closeSmsWorker(worker: Worker) {
  await worker.close();
  logger.info('SMS worker closed');
}
