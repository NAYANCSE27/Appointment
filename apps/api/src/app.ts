import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { requestIdMiddleware as requestId } from './middleware/requestId';
import { resolveTenant } from './middleware/resolveTenant';
import { generalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth';
import { usersRouter } from './modules/users';
import { adminRouter } from './modules/admin';

export function createApp() {
  const app = express();

  // 1. Request ID (first - generates unique ID for each request)
  app.use(requestId);

  // 2. Tenant resolution (early - needed for data isolation)
  app.use(resolveTenant);

  // 3. Security middleware
  app.use(helmet());
  app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true }));

  // 4. Cookie parser (for refresh tokens)
  app.use(cookieParser());

  // 5. Body parsing
  app.use(express.json({ limit: '10mb' }));

  // 6. Logging
  app.use(morgan('combined'));

  // 7. Rate limiting
  app.use(generalRateLimiter);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/admin', adminRouter);

  // Error handler (MUST be last)
  app.use(errorHandler);

  return app;
}
