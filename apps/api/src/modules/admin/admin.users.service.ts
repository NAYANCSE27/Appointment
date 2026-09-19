import { prisma } from '../../config/prisma';
import { Role } from '@prisma/client';
import { hashBcrypt, generateSecureToken, hashSHA256 } from '../../utils/crypto';
import type { AdminCreateUserInput, AdminUpdateUserInput, AdminListUsersQuery } from './admin.schemas';

export class AdminUsersService {
  /**
   * List all users with pagination and filters
   */
  async listUsers(tenantId: string, query: AdminListUsersQuery) {
    const { page, limit, search, role, status } = query;
    const skip = (page - 1) * limit;

    const where: any = { tenantId, deletedAt: null };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (status) {
      switch (status) {
        case 'ACTIVE':
          where.isActive = true;
          where.isEmailVerified = true;
          break;
        case 'SUSPENDED':
          where.isActive = false;
          break;
        case 'UNVERIFIED':
          where.isEmailVerified = false;
          break;
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          isEmailVerified: true,
          profilePhotoUrl: true,
          createdAt: true,
          provider: {
            select: { id: true, specialty: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(tenantId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        dateOfBirth: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
        profilePhotoUrl: true,
        notifyByEmail: true,
        notifyBySms: true,
        createdAt: true,
        updatedAt: true,
        provider: {
          select: {
            id: true,
            specialty: true,
            licenseNumber: true,
            bio: true,
            appointmentBuffer: true,
            minimumNoticeHours: true,
            services: { select: { service: { select: { id: true, name: true } } } },
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
   * Create a new user (typically for creating providers)
   */
  async createUser(tenantId: string, data: AdminCreateUserInput) {
    // Check for existing email
    const existingUser = await prisma.user.findFirst({
      where: { email: data.email, tenantId },
    });

    if (existingUser) {
      throw new Error('Email is already in use');
    }

    // Generate a temporary password
    const tempPassword = generateSecureToken(16);
    const passwordHash = await hashBcrypt(tempPassword);

    // Generate verification token
    const verifyToken = generateSecureToken(32);
    const verifyTokenHash = hashSHA256(verifyToken);

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        role: data.role as Role,
        isEmailVerified: false,
        emailVerifyToken: verifyTokenHash,
        emailVerifyExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // If creating a provider, create the provider record
    if (data.role === 'PROVIDER') {
      await prisma.provider.create({
        data: {
          userId: user.id,
          tenantId,
          specialty: '',
        },
      });
    }

    // TODO: Queue welcome email with temp password and verification link

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tempPassword, // Only returned once for admin to share
    };
  }

  /**
   * Update user
   */
  async updateUser(tenantId: string, userId: string, data: AdminUpdateUserInput) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const updateData: any = {};
    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        isEmailVerified: true,
      },
    });

    return updatedUser;
  }

  /**
   * Suspend user
   */
  async suspendUser(tenantId: string, userId: string) {
    return this.updateUser(tenantId, userId, { isActive: false });
  }

  /**
   * Reactivate user
   */
  async reactivateUser(tenantId: string, userId: string) {
    return this.updateUser(tenantId, userId, { isActive: true });
  }

  /**
   * Anonymize user (HIPAA soft delete)
   */
  async anonymizeUser(tenantId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Anonymize PII fields but keep the UUID for FK integrity
    const anonymizedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        email: `anonymized-${userId}@deleted.com`,
        firstName: 'Anonymized',
        lastName: 'User',
        phone: null,
        dateOfBirth: null,
        profilePhotoUrl: null,
        deletedAt: new Date(),
        isActive: false,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    // Delete OAuth tokens
    await prisma.oAuthToken.deleteMany({
      where: { userId },
    });

    // Revoke refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });

    return anonymizedUser;
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(tenantId: string, userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const resetToken = generateSecureToken(32);
    const resetTokenHash = hashSHA256(resetToken);
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetToken: resetTokenHash,
        passwordResetExpiry: resetExpiry,
      },
    });

    // TODO: Queue password reset email job

    return { message: 'Password reset email sent' };
  }
}

export const adminUsersService = new AdminUsersService();
