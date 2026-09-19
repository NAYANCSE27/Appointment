import { z } from 'zod';
import { Role } from '@prisma/client';

// User management schemas
export const adminCreateUserSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(['PATIENT', 'PROVIDER', 'ADMIN']),
  dateOfBirth: z.string().datetime().optional(),
});

export const adminUpdateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  dateOfBirth: z.string().datetime().optional().nullable(),
});

export const adminListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['PATIENT', 'PROVIDER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'UNVERIFIED']).optional(),
});

// Service management schemas
export const adminCreateServiceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.string().min(1).max(100),
  durationMins: z.coerce.number().int().min(15).max(480),
  priceDecimal: z.coerce.number().positive(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#4A90E2'),
  isActive: z.boolean().default(true),
});

export const adminUpdateServiceSchema = adminCreateServiceSchema.partial();

// Provider management schemas
export const adminCreateProviderSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email(),
  phone: z.string().optional(),
  specialty: z.string().min(1).max(100),
  licenseNumber: z.string().optional(),
  bio: z.string().max(1000).optional(),
  appointmentBuffer: z.coerce.number().int().min(0).max(60).default(10),
  minimumNoticeHours: z.coerce.number().int().min(0).max(72).default(2),
  serviceIds: z.array(z.string().uuid()).optional(),
  roomIds: z.array(z.string().uuid()).optional(),
});

export const adminUpdateProviderSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z.string().optional(),
  specialty: z.string().min(1).max(100).optional(),
  licenseNumber: z.string().optional(),
  bio: z.string().max(1000).optional(),
  appointmentBuffer: z.coerce.number().int().min(0).max(60).optional(),
  minimumNoticeHours: z.coerce.number().int().min(0).max(72).optional(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(z.string().uuid()).optional(),
  roomIds: z.array(z.string().uuid()).optional(),
});

// Clinic settings schemas
export const adminUpdateTenantSettingsSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  timezone: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  cancellationNoticeHours: z.coerce.number().int().min(0).max(168).optional(),
  smsEnabled: z.boolean().optional(),
  calendarSyncEnabled: z.boolean().optional(),
  guestBookingEnabled: z.boolean().optional(),
});

export const adminCreateHolidaySchema = z.object({
  date: z.string().datetime(),
  name: z.string().min(1).max(100),
});

export const adminCreateWorkingHoursSchema = z.object({
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  openTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  closeTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  isClosed: z.boolean().default(false),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;
export type AdminCreateServiceInput = z.infer<typeof adminCreateServiceSchema>;
export type AdminUpdateServiceInput = z.infer<typeof adminUpdateServiceSchema>;
export type AdminCreateProviderInput = z.infer<typeof adminCreateProviderSchema>;
export type AdminUpdateProviderInput = z.infer<typeof adminUpdateProviderSchema>;
