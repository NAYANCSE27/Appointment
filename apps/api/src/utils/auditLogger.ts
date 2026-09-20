import { prisma } from '../config/prisma';
import { logger } from './logger';
import { Role } from '@prisma/client';

interface AuditLogParams {
  tenantId: string;
  actorId?: string;
  actorRole?: Role;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Logs an audit entry to the database.
 * This is synchronous for compliance - must not fail silently.
 * NEVER throws - wraps in try/catch and logs to Winston on failure.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeState: params.beforeState ?? undefined,
        afterState: params.afterState ?? undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    // NEVER throw - log the error and continue
    logger.error('Failed to write audit log', {
      error: error instanceof Error ? error.message : 'Unknown error',
      params,
    });
  }
}
