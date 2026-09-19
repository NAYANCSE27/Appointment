import { prisma } from '../../config/prisma';
import { hashBcrypt, compareBcrypt, generateSecureToken, hashSHA256 } from '../../utils/crypto';
import type { UpdateProfileInput, ChangePasswordInput, ChangeEmailInput } from './users.schemas';

export class UsersService {
  /**
   * Get current user profile
   */
  async getMyProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        dateOfBirth: true,
        role: true,
        profilePhotoUrl: true,
        isEmailVerified: true,
        notifyByEmail: true,
        notifyBySms: true,
        createdAt: true,
        provider: {
          select: {
            id: true,
            specialty: true,
            licenseNumber: true,
            bio: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Update user profile
   */
  async updateMyProfile(userId: string, data: UpdateProfileInput) {
    const updateData: any = {};

    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.notifyByEmail !== undefined) updateData.notifyByEmail = data.notifyByEmail;
    if (data.notifyBySms !== undefined) updateData.notifyBySms = data.notifyBySms;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        dateOfBirth: true,
        role: true,
        profilePhotoUrl: true,
        notifyByEmail: true,
        notifyBySms: true,
      },
    });

    return user;
  }

  /**
   * Change password
   */
  async changePassword(userId: string, data: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await compareBcrypt(data.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await hashBcrypt(data.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Revoke all refresh tokens (force re-login on other devices)
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    return { message: 'Password changed successfully. Please login again.' };
  }

  /**
   * Change email (requires verification)
   */
  async changeEmail(userId: string, tenantId: string, data: ChangeEmailInput) {
    // Check if email is already in use
    const existingUser = await prisma.user.findFirst({
      where: { email: data.newEmail, tenantId },
    });

    if (existingUser) {
      throw new Error('Email is already in use');
    }

    const verifyToken = generateSecureToken(32);
    const verifyTokenHash = hashSHA256(verifyToken);

    // Store pending email change
    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifyToken: verifyTokenHash,
        emailVerifyExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // TODO: Queue email verification job with new email

    return { message: 'Verification email sent to the new address.' };
  }

  /**
   * Upload avatar
   */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    // TODO: Implement S3 upload
    // For now, just store the path
    const avatarUrl = `/uploads/avatars/${userId}-${Date.now()}.${file.mimetype.split('/')[1]}`;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { profilePhotoUrl: avatarUrl },
      select: { id: true, profilePhotoUrl: true },
    });

    return user;
  }

  /**
   * Disconnect OAuth provider
   */
  async disconnectOAuth(userId: string, provider: string) {
    await prisma.oAuthToken.delete({
      where: { userId_provider: { userId, provider } },
    });

    return { message: `${provider} disconnected successfully` };
  }
}

export const usersService = new UsersService();
