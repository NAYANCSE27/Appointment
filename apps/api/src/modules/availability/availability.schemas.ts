import { z } from 'zod';

export const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid('Invalid service ID'),
  providerId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  timezone: z.string().min(1, 'Timezone is required'),
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  const maxRange = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
  return end >= start && (end.getTime() - start.getTime()) <= maxRange;
}, {
  message: 'Date range must be at most 30 days and end date must be after start date',
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
