import { prisma } from '../../config/prisma';
import { ListServicesQuery } from './services.schemas';

export class ServicesService {
  /**
   * List active services with optional filtering and pagination
   */
  static async listServices(
    tenantId: string,
    query: ListServicesQuery
  ): Promise<{
    services: Awaited<ReturnType<typeof prisma.service.findMany>>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { category, search, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      isActive: true,
      ...(category && { category }),
      ...(search && search.length >= 3 && {
        name: { contains: search, mode: 'insensitive' as const },
      }),
    };

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.service.count({ where }),
    ]);

    return {
      services,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single service by ID with provider count
   */
  static async getServiceById(tenantId: string, id: string) {
    const service = await prisma.service.findFirst({
      where: {
        id,
        tenantId,
        isActive: true,
      },
      include: {
        _count: {
          select: { providers: true },
        },
      },
    });

    if (!service) {
      const error = new Error('Service not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    return {
      ...service,
      providerCount: service._count.providers,
    };
  }
}
