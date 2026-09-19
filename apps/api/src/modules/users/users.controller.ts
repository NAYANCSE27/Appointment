import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service';
import type { UpdateProfileInput, ChangePasswordInput, ChangeEmailInput } from './users.schemas';

export class UsersController {
  async getMyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;

      const user = await usersService.getMyProfile(userId);

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateMyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;
      const data = req.body as UpdateProfileInput;

      const user = await usersService.updateMyProfile(userId, data);

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;
      const data = req.body as ChangePasswordInput;

      const result = await usersService.changePassword(userId, data);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async changeEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;
      const tenantId = (req as any).tenantId;
      const data = req.body as ChangeEmailInput;

      const result = await usersService.changeEmail(userId, tenantId, data);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async uploadAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;
      const file = req.file;

      if (!file) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        });
        return;
      }

      const user = await usersService.uploadAvatar(userId, file);

      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async disconnectOAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.userId;
      const provider = req.params.provider;

      const result = await usersService.disconnectOAuth(userId, provider);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const usersController = new UsersController();
