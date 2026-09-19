import { prisma } from '../../config/prisma';
import type { AdminCreateServiceInput, AdminUpdateServiceInput } from './admin.schemas';

export class AdminServicesService {
  /**
   * List all services
   */
  async listServices(tenantId: string) {
    const services = await prisma.service.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        providers: {
          select: {
            provider: {
              select: {
                id: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        _count: {
          select: { appointments: true },
        },
      },
    });

    return services;
  }

  /**
   * Get service by ID
   */
  async getServiceById(tenantId: string, serviceId: string) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, tenantId },
      include: {
        providers: {
          select: {
            provider: {
              select: {
                id: true,
                specialty: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        _count: {
          select: { appointments: true },
        },
      },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    return service;
  }

  /**
   * Create a new service
   */
  async createService(tenantId: string, data: AdminCreateServiceInput) {
    const service = await prisma.service.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        category: data.category,
        durationMins: data.durationMins,
        priceDecimal: data.priceDecimal,
        color: data.color,
        isActive: data.isActive,
      },
    });

    return service;
  }

  /**
   * Update service
   */
  async updateService(tenantId: string, serviceId: string, data: AdminUpdateServiceInput) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, tenantId },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category) updateData.category = data.category;
    if (data.durationMins) updateData.durationMins = data.durationMins;
    if (data.priceDecimal) updateData.priceDecimal = data.priceDecimal;
    if (data.color) updateData.color = data.color;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updatedService = await prisma.service.update({
      where: { id: serviceId },
      data: updateData,
    });

    return updatedService;
  }

  /**
   * Deactivate service (cannot delete if has appointments)
   */
  async deactivateService(tenantId: string, serviceId: string) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, tenantId },
      include: {
        _count: { select: { appointments: true } },
      },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    // Check if service has appointments
    if (service._count.appointments > 0) {
      // Can only deactivate, not delete
      const deactivated = await prisma.service.update({
        where: { id: serviceId },
        data: { isActive: false },
      });
      return { message: 'Service deactivated (has existing appointments)', service: deactivated };
    }

    // No appointments, safe to delete
    await prisma.service.delete({
      where: { id: serviceId },
    });

    return { message: 'Service deleted successfully' };
  }

  /**
   * Assign providers to a service
   */
  async assignProvidersToService(tenantId: string, serviceId: string, providerIds: string[]) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, tenantId },
    });

    if (!service) {
      throw new Error('Service not found');
    }

    // Remove existing assignments
    await prisma.providerService.deleteMany({
      where: { serviceId },
    });

    // Add new assignments
    if (providerIds.length > 0) {
      await prisma.providerService.createMany({
        data: providerIds.map((providerId) => ({
          providerId,
          serviceId,
        })),
        skipDuplicates: true,
      });
    }

    return { message: 'Providers assigned successfully' };
  }
}

export const adminServicesService = new AdminServicesService();
