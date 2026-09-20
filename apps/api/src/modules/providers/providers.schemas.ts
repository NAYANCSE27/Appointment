import { z } from 'zod';
import { DayOfWeek, ExceptionType } from '@prisma/client';

// Schema for updating provider schedule
export const updateScheduleSchema = z.object({
  schedules: z.array(
    z.object({
      dayOfWeek: z.nativeEnum(DayOfWeek),
      windows: z.array(
        z.object({
          startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
          endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:mm)'),
        })
      ).min(1, 'At least one working window required'),
    })
  ).min(1, 'At least one day schedule required'),
  appointmentBuffer: z.number().int().min(0).max(60).default(10),
  minimumNoticeHours: z.number().int().min(0).max(168).default(2),
});

export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;

// Schema for creating an exception
export const createExceptionSchema = z.object({
  type: z.nativeEnum(ExceptionType),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  reason: z.string().max(500).optional(),
}).refine((data) => data.endDate >= data.startDate, {
  message: 'End date must be after or equal to start date',
});

export type CreateExceptionDto = z.infer<typeof createExceptionSchema>;

// Query schemas
export const listProvidersQuerySchema = z.object({
  serviceId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListProvidersQuery = z.infer<typeof listProvidersQuerySchema>;

export const listExceptionsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListExceptionsQuery = z.infer<typeof listExceptionsQuerySchema>;

export const listProviderAppointmentsQuerySchema = z.object({
  status: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListProviderAppointmentsQuery = z.infer<typeof listProviderAppointmentsQuerySchema>;
