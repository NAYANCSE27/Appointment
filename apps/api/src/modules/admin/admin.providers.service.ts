import { prisma } from '../../config/prisma';
import { hashBcrypt, generateSecureToken, hashSHA256 } from '../../utils/crypto';
import type { AdminCreateProviderInput, AdminUpdateProviderInput } from './admin.schemas';

export class AdminProvidersService {
  /**
   * List all providers
   */
  async listProviders(tenantId: string) {
    const providers = await prisma.provider.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            profilePhotoUrl: true,
            isActive: true,
          },
        },
        services: {
          select: {
            service: {
              select: { id: true, name: true, category: true },
            },
          },
        },
        rooms: {
          select: {
            room: {
              select: { id: true, name: true },
            },
          },
        },
        _count: {
          select: { appointments: true },
        },
      },
      orderBy: {
        user: { lastName: 'asc' },
      },
    });

    return providers;
  }

  /**
   * Get provider by ID
   */
  async getProviderById(tenantId: string, providerId: string) {
    const provider = await prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            profilePhotoUrl: true,
            isActive: true,
            createdAt: true,
          },
        },
        services: {
          select: {
            service: {
              select: { id: true, name: true, category: true, durationMins: true },
            },
          },
        },
        rooms: {
          select: {
            room: {
              select: { id: true, name: true, description: true },
            },
          },
        },
        weeklySchedules: {
          where: { isActive: true },
          orderBy: { dayOfWeek: 'asc' },
        },
        exceptions: {
          where: { endDate: { gte: new Date() } },
          orderBy: { startDate: 'asc' },
        },
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    return provider;
  }

  /**
   * Create a new provider
   */
  async createProvider(tenantId: string, data: AdminCreateProviderInput) {
    // Check for existing email
    const existingUser = await prisma.user.findFirst({
      where: { email: data.email, tenantId },
    });

    if (existingUser) {
      throw new Error('Email is already in use');
    }

    // Generate temporary password
    const tempPassword = generateSecureToken(16);
    const passwordHash = await hashBcrypt(tempPassword);

    // Generate verification token
    const verifyToken = generateSecureToken(32);
    const verifyTokenHash = hashSHA256(verifyToken);

    // Create user and provider in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: 'PROVIDER',
          isEmailVerified: false,
          emailVerifyToken: verifyTokenHash,
          emailVerifyExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const provider = await tx.provider.create({
        data: {
          userId: user.id,
          tenantId,
          specialty: data.specialty,
          licenseNumber: data.licenseNumber,
          bio: data.bio,
          appointmentBuffer: data.appointmentBuffer,
          minimumNoticeHours: data.minimumNoticeHours,
        },
      });

      // Assign services
      if (data.serviceIds && data.serviceIds.length > 0) {
        await tx.providerService.createMany({
          data: data.serviceIds.map((serviceId) => ({
            providerId: provider.id,
            serviceId,
          })),
          skipDuplicates: true,
        });
      }

      // Assign rooms
      if (data.roomIds && data.roomIds.length > 0) {
        await tx.providerRoom.createMany({
          data: data.roomIds.map((roomId) => ({
            providerId: provider.id,
            roomId,
          })),
          skipDuplicates: true,
        });
      }

      return { user, provider };
    });

    // TODO: Queue provider welcome email

    return {
      id: result.provider.id,
      userId: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      specialty: result.provider.specialty,
      tempPassword, // Only returned once
    };
  }

  /**
   * Update provider
   */
  async updateProvider(tenantId: string, providerId: string, data: AdminUpdateProviderInput) {
    const provider = await prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      include: { user: true },
    });

    if (!provider) {
      throw new Error('Provider not found');
    }

    // Update in transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Update user fields
      const userUpdateData: any = {};
      if (data.firstName) userUpdateData.firstName = data.firstName;
      if (data.lastName) userUpdateData.lastName = data.lastName;
      if (data.phone !== undefined) userUpdateData.phone = data.phone;
      if (data.isActive !== undefined) userUpdateData.isActive = data.isActive;

      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: provider.userId },
          data: userUpdateData,
        });
      }

      // Update provider fields
      const providerUpdateData: any = {};
      if (data.specialty) providerUpdateData.specialty = data.specialty;
      if (data.licenseNumber !== undefined) providerUpdateData.licenseNumber = data.licenseNumber;
      if (data.bio !== undefined) providerUpdateData.bio = data.bio;
      if (data.appointmentBuffer !== undefined) providerUpdateData.appointmentBuffer = data.appointmentBuffer;
      if (data.minimumNoticeHours !== undefined) providerUpdateData.minimumNoticeHours = data.minimumNoticeHours;
      if (data.isActive !== undefined) providerUpdateData.isActive = data.isActive;

      const updatedProvider = await tx.provider.update({
        where: { id: providerId },
        data: providerUpdateData,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              isActive: true,
            },
          },
        },
      });

      // Update service assignments if provided
      if (data.serviceIds) {
        await tx.providerService.deleteMany({
          where: { providerId },
        });

        if (data.serviceIds.length > 0) {
          await tx.providerService.createMany({
            data: data.serviceIds.map((serviceId) => ({
              providerId,
              serviceId,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Update room assignments if provided
      if (data.roomIds) {
        await tx.providerRoom.deleteMany({
          where: { providerId },
        });

        if (data.roomIds.length > 0) {
          await tx.providerRoom.createMany({
            data: data.roomIds.map((roomId) => ({
              providerId,
              roomId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return updatedProvider;
    });

    return updated;
  }

  /**
   * Deactivate provider
   */
  async deactivateProvider(tenantId: string, providerId: string) {
    return this.updateProvider(tenantId, providerId, { isActive: false });
  }
}

export const adminProvidersService = new AdminProvidersService();
