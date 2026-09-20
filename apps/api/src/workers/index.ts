import { createEmailWorker, closeEmailWorker } from './email.worker';
import { createSmsWorker, closeSmsWorker } from './sms.worker';
import { createReminderWorker, closeReminderWorker } from './reminder.worker';
import { createCalendarSyncWorker, closeCalendarSyncWorker } from './calendarSync.worker';
import { logger } from '../utils/logger';

export { createEmailWorker, closeEmailWorker };
export { createSmsWorker, closeSmsWorker };
export { createReminderWorker, closeReminderWorker };
export { createCalendarSyncWorker, closeCalendarSyncWorker };

// Workers array for lifecycle management
let workers: Awaited<ReturnType<typeof createEmailWorker>>[] = [];

/**
 * Start all workers
 */
export async function startAllWorkers() {
  logger.info('Starting all workers...');

  const emailWorker = createEmailWorker();
  const smsWorker = createSmsWorker();
  const reminderWorker = createReminderWorker();
  const calendarSyncWorker = createCalendarSyncWorker();

  workers = [emailWorker, smsWorker, reminderWorker, calendarSyncWorker];

  logger.info('All workers started', {
    workers: ['email', 'sms', 'reminder', 'calendar-sync'],
  });
}

/**
 * Stop all workers gracefully
 */
export async function stopAllWorkers() {
  logger.info('Stopping all workers...');

  await Promise.all(workers.map((worker) => worker.close()));

  logger.info('All workers stopped');
}
