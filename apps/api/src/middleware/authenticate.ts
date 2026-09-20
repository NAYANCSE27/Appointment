import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    (req as AuthRequest).user = payload;
    next();
  } catch (error) {
    logger.warn('Authentication failed', { error });
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token expired or invalid' } });
  }
};

/**
 * Optional authentication - allows requests with or without token
 * If token is present and valid, user is attached to request
 * If token is missing or invalid, request continues without user
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token - continue without user
    next();
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    (req as AuthRequest).user = payload;
  } catch (error) {
    // Invalid token - continue without user (for guest bookings)
    logger.debug('Optional auth: invalid token, continuing as guest', { error });
  }

  next();
};
