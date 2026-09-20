import { Request, Response, NextFunction } from 'express';
import { ServicesService } from './services.service';

export class ServicesController {
  static async listServices(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = (req as any).tenant;
      const query = (req as any).validatedQuery;

      const result = await ServicesService.listServices(tenant.id, query);

      res.json({
        success: true,
        data: {
          services: result.services,
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

  static async getServiceById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = (req as any).tenant;
      const { id } = req.params;

      const service = await ServicesService.getServiceById(tenant.id, id);

      res.json({
        success: true,
        data: service,
      });
    } catch (error) {
      next(error);
    }
  }
}
