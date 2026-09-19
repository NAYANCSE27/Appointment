import { PrismaClient } from '@prisma/client';

// Global singleton
export const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// We could add global tenant filter extensions here if needed
// prisma.$extends(...)
