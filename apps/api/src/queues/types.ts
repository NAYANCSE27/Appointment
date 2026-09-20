import { NotificationType } from '@prisma/client';

// Base job data shared across all notification jobs
interface BaseJobData {
  appointmentId: string;
  recipientUserId: string;
  tenantId: string;
}

// Email notification job data
export interface EmailJobData extends BaseJobData {
  type: NotificationType;
}

// SMS notification job data
export interface SmsJobData extends BaseJobData {
  type: NotificationType;
}

// Calendar sync job data
export interface CalendarSyncJobData {
  appointmentId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  tenantId: string;
}

// Reminder job data
export interface ReminderJobData {
  appointmentId: string;
  type: '24H_REMINDER' | '1H_REMINDER';
  tenantId: string;
}

// Job result types
export interface EmailJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface CalendarSyncJobResult {
  success: boolean;
  googleEventId?: string;
  microsoftEventId?: string;
  error?: string;
}

export interface ReminderJobResult {
  success: boolean;
  emailJobId?: string;
  smsJobId?: string;
  error?: string;
}
