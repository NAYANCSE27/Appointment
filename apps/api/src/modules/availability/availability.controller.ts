import { Request, Response, NextFunction } from 'express';
import { AvailabilityService } from './availability.service';

export class AvailabilityController {
  static async getAvailableSlots(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = (req as any).tenant;
      const query = (req as any).validatedQuery;

      const result = await AvailabilityService.getAvailableSlots(tenant.id, query);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
