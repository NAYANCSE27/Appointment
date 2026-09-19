import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schemas';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body as RegisterInput;

      const result = await authService.register(data, tenantId);

      res.status(201).json({
        success: true,
        message: result.message,
        data: result.userId ? { userId: result.userId } : undefined,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body as LoginInput;

      const result = await authService.login(data, tenantId);

      // Set refresh token as httpOnly cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const refreshToken = req.cookies?.refreshToken;

      await authService.logout(user.userId, refreshToken);

      // Clear the cookie
      res.clearCookie('refreshToken', {
        path: '/api/v1/auth/refresh',
      });

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

      const result = await authService.refreshTokens(refreshToken);

      // Set new refresh token cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/v1/auth/refresh',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).tenantId;
      const data = req.body as ForgotPasswordInput;

      const result = await authService.forgotPassword(data, tenantId);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body as ResetPasswordInput;

      const result = await authService.resetPassword(data);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.query.token as string;

      if (!token) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Token is required' },
        });
        return;
      }

      const result = await authService.verifyEmail(token);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
