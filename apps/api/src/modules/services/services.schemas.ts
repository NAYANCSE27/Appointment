import { z } from 'zod';

export const listServicesQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().min(3).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});

export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
