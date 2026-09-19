import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis';

// Rate limiter for auth routes (strict)
export const authRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error - RedisStore types don't match ioredis exactly
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        statusCode: 429,
        retryAfterSeconds: 60,
      },
    });
  },
});

// General API rate limiter (more permissive)
export const generalRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error - RedisStore types don't match ioredis exactly
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        statusCode: 429,
        retryAfterSeconds: 60,
      },
    });
  },
});
