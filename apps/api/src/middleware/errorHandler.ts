import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = (req as any).requestId || uuidv4();

  // Log the error internally
  logger.error('Error occurred', {
    requestId,
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  // Default error response
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        statusCode = 409;
        errorCode = 'DUPLICATE_RESOURCE';
        message = 'A record with this value already exists';
        break;
      case 'P2025':
        statusCode = 404;
        errorCode = 'NOT_FOUND';
        message = 'The requested resource was not found';
        break;
      case 'P2003':
        statusCode = 400;
        errorCode = 'BAD_REQUEST';
        message = 'Invalid reference to related resource';
        break;
      default:
        statusCode = 400;
        errorCode = 'DATABASE_ERROR';
        message = 'A database error occurred';
    }
  }

  // Handle validation errors (already handled by validate middleware, but catch any others)
  if (error.name === 'ZodError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
  }

  // Send error response (NEVER expose stack traces in production)
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      statusCode,
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  });
};
