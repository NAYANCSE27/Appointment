import { Request, Response, NextFunction } from 'express';
import { ProvidersService } from './providers.service';

export class ProvidersController {
  // Public routes
  static async listProviders(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = (req as any).tenant;
      const query = (req as any).validatedQuery;

      const result = await ProvidersService.listProviders(tenant.id, query);

      res.json({
        success: true,
        data: {
          providers: result.providers,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProviderById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = (req as any).tenant;
      const { id } = req.params;

      const provider = await ProvidersService.getProviderPublicProfile(tenant.id, id);

      res.json({
        success: true,
        data: provider,
      });
    } catch (error) {
      next(error);
    }
  }

  // Protected routes (Provider only)
  static async getMySchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;

      // Get provider record for this user
      const provider = await getProviderForUser(user.userId);
      const schedule = await ProvidersService.getMySchedule(provider.id);

      res.json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateMySchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const data = (req as any).validatedBody;

      const provider = await getProviderForUser(user.userId);
      const schedule = await ProvidersService.updateMySchedule(provider.id, data);

      res.json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMyExceptions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const query = (req as any).validatedQuery;

      const provider = await getProviderForUser(user.userId);
      const exceptions = await ProvidersService.getMyExceptions(provider.id, query);

      res.json({
        success: true,
        data: exceptions,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createException(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const data = (req as any).validatedBody;

      const provider = await getProviderForUser(user.userId);
      const exception = await ProvidersService.createException(provider.id, data);

      res.status(201).json({
        success: true,
        data: exception,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteException(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { id } = req.params;

      const provider = await getProviderForUser(user.userId);
      await ProvidersService.deleteException(provider.id, id);

      res.json({
        success: true,
        data: { message: 'Exception deleted successfully' },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMyAppointments(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const query = (req as any).validatedQuery;

      const provider = await getProviderForUser(user.userId);
      const result = await ProvidersService.getMyAppointments(provider.id, query);

      res.json({
        success: true,
        data: {
          appointments: result.appointments,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

// Helper to get provider record for a user
async function getProviderForUser(userId: string) {
  const { prisma } = await import('../../config/prisma');
  const provider = await prisma.provider.findUnique({
    where: { userId },
  });

  if (!provider) {
    const error = new Error('Provider record not found') as Error & { statusCode?: number; code?: string };
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  return provider;
}
