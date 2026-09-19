import Redis from 'ioredis';
import { env } from './env';

// Export a singleton Redis instance
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});
