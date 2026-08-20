import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('combined'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
