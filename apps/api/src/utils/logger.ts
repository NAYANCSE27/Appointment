import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

const { combine, timestamp, printf, colorize, json } = winston.format;

const customFormat = printf(({ level, message, timestamp, ...meta }) => {
  const store = requestContext.getStore();
  const reqId = store?.requestId ? `[${store.requestId}] ` : '';
  return `${timestamp} ${level}: ${reqId}${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' 
    ? combine(timestamp(), json())
    : combine(colorize(), timestamp(), customFormat),
  transports: [
    new winston.transports.Console()
  ]
});
