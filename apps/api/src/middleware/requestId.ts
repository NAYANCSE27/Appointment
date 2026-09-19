import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContext } from '../utils/logger';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('X-Request-ID', requestId);
  
  requestContext.run({ requestId }, () => {
    next();
  });
};
