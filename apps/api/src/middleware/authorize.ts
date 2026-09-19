import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

export const authorize = (allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          statusCode: 401,
        },
      });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          statusCode: 403,
        },
      });
      return;
    }

    next();
  };
};
