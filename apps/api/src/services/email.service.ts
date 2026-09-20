import Handlebars from 'handlebars';
import sgMail from '@sendgrid/mail';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Initialize SendGrid if API key is configured
if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY);
}

// Template variables interface
export interface TemplateVariables {
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string;
  patientPhone?: string;
  providerName: string;
  providerSpecialty: string;
  serviceName: string;
  serviceDurationMins: number;
  appointmentDate: string;
  appointmentTime: string;
  appointmentTimezone: string;
  bookingRef: string;
  clinicName: string;
  clinicAddress?: string;
  clinicPhone?: string;
  cancellationDeadline?: string;
}

// Email options
export interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

/**
 * Send an email using SendGrid
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!env.SENDGRID_API_KEY) {
    logger.warn('SendGrid API key not configured, email would have been sent', {
      to: options.to,
      subject: options.subject,
    });
    return { success: true, messageId: 'mock-message-id' };
  }

  try {
    const response = await sgMail.send({
      to: options.to,
      from: env.EMAIL_FROM || 'noreply@medibook.com',
      subject: options.subject,
      html: options.htmlBody,
      text: options.textBody || undefined,
    });

    const messageId = response[0]?.headers?.['x-message-id'];
    logger.info('Email sent successfully', { to: options.to, messageId });

    return { success: true, messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send email', { to: options.to, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Compile a Handlebars template with the given variables
 */
export function compileTemplate(
  templateBody: string,
  variables: TemplateVariables
): string {
  const template = Handlebars.compile(templateBody);
  return template(variables);
}

/**
 * Build template variables from appointment and related data
 */
export function getTemplateVariables(data: {
  patient: { firstName: string; lastName: string; email: string; phone?: string | null };
  provider: { firstName: string; lastName: string; specialty: string };
  service: { name: string; durationMins: number };
  appointment: { startTime: Date; bookingRef: string; patientTimezone: string };
  tenant: { name: string; address?: string | null; phone?: string | null };
  cancellationDeadline?: string;
}): TemplateVariables {
  const appointmentDate = data.appointment.startTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: data.appointment.patientTimezone,
  });

  const appointmentTime = data.appointment.startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: data.appointment.patientTimezone,
  });

  return {
    patientFirstName: data.patient.firstName,
    patientLastName: data.patient.lastName,
    patientEmail: data.patient.email,
    patientPhone: data.patient.phone || undefined,
    providerName: `Dr. ${data.provider.firstName} ${data.provider.lastName}`,
    providerSpecialty: data.provider.specialty,
    serviceName: data.service.name,
    serviceDurationMins: data.service.durationMins,
    appointmentDate,
    appointmentTime,
    appointmentTimezone: data.appointment.patientTimezone,
    bookingRef: data.appointment.bookingRef,
    clinicName: data.tenant.name,
    clinicAddress: data.tenant.address || undefined,
    clinicPhone: data.tenant.phone || undefined,
    cancellationDeadline: data.cancellationDeadline,
  };
}
