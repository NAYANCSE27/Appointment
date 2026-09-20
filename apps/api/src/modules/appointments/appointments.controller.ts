import { Request, Response, NextFunction } from 'express';
import { AppointmentsService } from './appointments.service';

export class AppointmentsController {
  /**
   * Create appointment (authenticated or guest)
   */
  static async createAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = (req as any).tenant;
      const user = (req as any).user;
      const data = (req as any).validatedBody;

      const patientId = user?.userId; // undefined for guests

      const appointment = await AppointmentsService.createAppointment(
        tenant.id,
        patientId,
        data,
        req.ip,
        req.headers['user-agent']
      );

      res.status(201).json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get my appointments (patient)
   */
  static async getMyAppointments(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const query = (req as any).validatedQuery;

      const result = await AppointmentsService.getMyAppointments(user.userId, query);

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

  /**
   * Get appointment by ID
   */
  static async getAppointmentById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { id } = req.params;

      const appointment = await AppointmentsService.getAppointmentById(
        id,
        user.userId,
        user.role
      );

      res.json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel appointment
   */
  static async cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const data = (req as any).validatedBody;

      const appointment = await AppointmentsService.cancelAppointment(
        id,
        user.userId,
        user.role,
        data?.cancelReason,
        req.ip,
        req.headers['user-agent']
      );

      res.json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reschedule appointment
   */
  static async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const data = (req as any).validatedBody;

      const appointment = await AppointmentsService.rescheduleAppointment(
        id,
        user.userId,
        data,
        req.ip,
        req.headers['user-agent']
      );

      res.json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update appointment status (Provider)
   */
  static async updateAppointmentStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const data = (req as any).validatedBody;

      // Get provider ID for the user
      const { prisma } = await import('../../config/prisma');
      const provider = await prisma.provider.findUnique({
        where: { userId: user.userId },
      });

      if (!provider) {
        const error = new Error('Provider record not found') as Error & { statusCode?: number; code?: string };
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      const appointment = await AppointmentsService.updateAppointmentStatus(
        id,
        provider.id,
        data,
        req.ip,
        req.headers['user-agent']
      );

      res.json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create consultation note (Provider)
   */
  static async createConsultationNote(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const data = (req as any).validatedBody;

      // Get provider ID for the user
      const { prisma } = await import('../../config/prisma');
      const provider = await prisma.provider.findUnique({
        where: { userId: user.userId },
      });

      if (!provider) {
        const error = new Error('Provider record not found') as Error & { statusCode?: number; code?: string };
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        throw error;
      }

      const note = await AppointmentsService.createConsultationNote(
        id,
        provider.id,
        data,
        req.ip,
        req.headers['user-agent']
      );

      res.status(201).json({
        success: true,
        data: note,
      });
    } catch (error) {
      next(error);
    }
  }
}
