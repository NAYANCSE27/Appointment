import { z } from 'zod';
import { AppointmentStatus } from '@prisma/client';

// Create appointment schema
export const createAppointmentSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID'),
  providerId: z.string().uuid('Invalid provider ID'),
  startTime: z.string().datetime('Invalid start time format'),
  timezone: z.string().min(1, 'Timezone is required'),
  patientNotes: z.string().max(1000).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

export type CreateAppointmentDto = z.infer<typeof createAppointmentSchema>;

// Cancel appointment schema
export const cancelAppointmentSchema = z.object({
  cancelReason: z.string().max(500).optional(),
});

export type CancelAppointmentDto = z.infer<typeof cancelAppointmentSchema>;

// Reschedule appointment schema
export const rescheduleAppointmentSchema = z.object({
  newStartTime: z.string().datetime('Invalid start time format'),
  timezone: z.string().min(1, 'Timezone is required'),
});

export type RescheduleAppointmentDto = z.infer<typeof rescheduleAppointmentSchema>;

// Update status schema (for providers)
export const updateStatusSchema = z.object({
  status: z.enum([AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW]),
});

export type UpdateStatusDto = z.infer<typeof updateStatusSchema>;

// Create/update consultation note schema
export const createNoteSchema = z.object({
  content: z.string().max(5000, 'Note content must be at most 5000 characters'),
  isSharedWithPatient: z.boolean().default(false),
});

export type CreateNoteDto = z.infer<typeof createNoteSchema>;

// Query schemas
export const listMyAppointmentsQuerySchema = z.object({
  status: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListMyAppointmentsQuery = z.infer<typeof listMyAppointmentsQuerySchema>;
