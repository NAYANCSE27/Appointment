import { Queue } from 'bullmq';
import { redis } from '../config/redis';

const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname || 'localhost',
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port) || 6379,
};

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

// Email notifications queue
export const emailQueue = new Queue('email-notifications', {
  connection,
  defaultJobOptions,
});

// SMS notifications queue
export const smsQueue = new Queue('sms-notifications', {
  connection,
  defaultJobOptions,
});

// Calendar sync queue
export const calendarSyncQueue = new Queue('calendar-sync', {
  connection,
  defaultJobOptions,
});

// Scheduled reminders queue
export const reminderQueue = new Queue('scheduled-reminders', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    removeOnComplete: { count: 1000 }, // Keep more reminders for audit
  },
});

// Export all queues for cleanup
export const queues = [emailQueue, smsQueue, calendarSyncQueue, reminderQueue];
