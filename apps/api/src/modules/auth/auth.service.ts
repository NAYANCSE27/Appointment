import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { hashBcrypt, compareBcrypt, generateSecureToken, hashSHA256 } from '../../utils/crypto';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { Role } from '@prisma/client';
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput } from './auth.schemas';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export class AuthService {
  /**
   * Register a new patient
   */
  async register(data: RegisterInput, tenantId: string) {
    const existingUser = await prisma.user.findFirst({
      where: { email: data.email, tenantId },
    });

    // Prevent user enumeration - always return same message
    if (existingUser) {
      // Still "succeed" but don't create duplicate
      return { message: 'If this email is not registered, you will receive a verification link.' };
    }

    const passwordHash = await hashBcrypt(data.password);
    const verifyToken = generateSecureToken(32);
    const verifyTokenHash = hashSHA256(verifyToken);
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        role: Role.PATIENT,
        isEmailVerified: false,
        emailVerifyToken: verifyTokenHash,
        emailVerifyExpiry: verifyExpiry,
      },
    });

    // TODO: Queue verification email job

    return { message: 'Registration successful. Please check your email to verify your account.', userId: user.id };
  }

  /**
   * Login with email and password
   */
  async login(data: LoginInput, tenantId: string) {
    const user = await prisma.user.findFirst({
      where: { email: data.email, tenantId },
    });

    if (!user) {
      // Generic message to prevent enumeration
      throw new Error('Invalid email or password');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new Error(`Account temporarily locked. Try again in ${remainingMinutes} minutes.`);
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      throw new Error('Please verify your email before logging in.');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is suspended. Contact support.');
    }

    // Verify password
    const isValidPassword = await compareBcrypt(data.password, user.passwordHash);
    if (!isValidPassword) {
      await this.handleFailedLogin(user.id, user.failedLoginAttempts);
      throw new Error('Invalid email or password');
    }

    // Reset failed attempts on successful login
    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // Generate tokens
    const accessToken = signAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });

    const refreshToken = signRefreshToken({ userId: user.id });
    const refreshTokenHash = hashSHA256(refreshToken);
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: refreshTokenExpiry,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profilePhotoUrl: user.profilePhotoUrl,
      },
    };
  }

  /**
   * Handle failed login attempts
   */
  private async handleFailedLogin(userId: string, currentAttempts: number) {
    const newAttempts = currentAttempts + 1;
    const updateData: any = { failedLoginAttempts: newAttempts };

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  /**
   * Logout - invalidate refresh token
   */
  async logout(userId: string, refreshToken: string) {
    if (!refreshToken) return;

    const tokenHash = hashSHA256(refreshToken);

    // Mark as revoked in DB
    await prisma.refreshToken.updateMany({
      where: { userId, tokenHash },
      data: { isRevoked: true },
    });

    // Add to Redis blocklist (for quick checks)
    const jti = hashSHA256(refreshToken);
    await redis.setex(`blocklist:${jti}`, 7 * 24 * 60 * 60, '1'); // 7 days
  }

  /**
   * Refresh tokens
   */
  async refreshTokens(refreshToken: string) {
    if (!refreshToken) {
      throw new Error('Refresh token required');
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new Error('Invalid or expired refresh token');
    }

    const tokenHash = hashSHA256(refreshToken);
    const storedToken = await prisma.refreshToken.findFirst({
      where: { userId: payload.userId, tokenHash, isRevoked: false },
    });

    if (!storedToken) {
      throw new Error('Refresh token not found or revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new Error('Refresh token expired');
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Generate new tokens (rotation)
    const newAccessToken = signAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });

    const newRefreshToken = signRefreshToken({ userId: user.id });
    const newTokenHash = hashSHA256(newRefreshToken);
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newTokenHash,
        expiresAt: newExpiry,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Forgot password - send reset link
   */
  async forgotPassword(data: ForgotPasswordInput, tenantId: string) {
    const user = await prisma.user.findFirst({
      where: { email: data.email, tenantId },
    });

    // Always return same message to prevent enumeration
    if (!user) {
      return { message: 'If this email is registered, you will receive a password reset link.' };
    }

    const resetToken = generateSecureToken(32);
    const resetTokenHash = hashSHA256(resetToken);
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetTokenHash,
        passwordResetExpiry: resetExpiry,
      },
    });

    // TODO: Queue password reset email job

    return { message: 'If this email is registered, you will receive a password reset link.' };
  }

  /**
   * Reset password with token
   */
  async resetPassword(data: ResetPasswordInput) {
    const tokenHash = hashSHA256(data.token);

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    const passwordHash = await hashBcrypt(data.newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    // Revoke all refresh tokens for this user
    await prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { isRevoked: true },
    });

    return { message: 'Password reset successful. Please login with your new password.' };
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string) {
    const tokenHash = hashSHA256(token);

    const user = await prisma.user.findFirst({
      where: {
        emailVerifyToken: tokenHash,
        emailVerifyExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });

    return { message: 'Email verified successfully. You can now login.' };
  }
}

export const authService = new AuthService();
