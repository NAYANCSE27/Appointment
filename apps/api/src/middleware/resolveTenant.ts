import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

export const resolveTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const tenantIdOrSlug = req.headers['x-tenant-id'] as string || 'demo'; // Default to demo if not provided for now

  try {
    const cacheKey = `tenant:${tenantIdOrSlug}`;
    let tenantId = await redis.get(cacheKey);

    if (!tenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { id: tenantIdOrSlug },
            { slug: tenantIdOrSlug }
          ]
        },
        select: { id: true }
      });

      if (!tenant) {
        res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
        return;
      }

      tenantId = tenant.id;
      await redis.setex(cacheKey, 3600, tenantId); // cache for 1 hour
    }

    // Attach to request
    (req as any).tenantId = tenantId;
    next();
  } catch (error) {
    logger.error('Error resolving tenant', { error });
    next(error);
  }
};
