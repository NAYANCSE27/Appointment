import { Router } from 'express';
import { AppointmentsController } from './appointments.controller';
import { authenticate, optionalAuth } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { Role } from '@prisma/client';
import {
  createAppointmentSchema,
  cancelAppointmentSchema,
  rescheduleAppointmentSchema,
  updateStatusSchema,
  createNoteSchema,
  listMyAppointmentsQuerySchema,
} from './appointments.schemas';

const router = Router();

// Public/Guest booking - optional auth (allows guest bookings)
router.post(
  '/',
  optionalAuth,
  validate(createAppointmentSchema, 'body'),
  AppointmentsController.createAppointment
);

// Patient routes - require authentication
router.get(
  '/my',
  authenticate,
  authorize([Role.PATIENT]),
  validate(listMyAppointmentsQuerySchema, 'query'),
  AppointmentsController.getMyAppointments
);

router.get(
  '/:id',
  authenticate,
  AppointmentsController.getAppointmentById
);

router.patch(
  '/:id/cancel',
  authenticate,
  validate(cancelAppointmentSchema, 'body'),
  AppointmentsController.cancelAppointment
);

router.patch(
  '/:id/reschedule',
  authenticate,
  authorize([Role.PATIENT]),
  validate(rescheduleAppointmentSchema, 'body'),
  AppointmentsController.rescheduleAppointment
);

// Provider routes
router.patch(
  '/:id/status',
  authenticate,
  authorize([Role.PROVIDER]),
  validate(updateStatusSchema, 'body'),
  AppointmentsController.updateAppointmentStatus
);

router.post(
  '/:id/notes',
  authenticate,
  authorize([Role.PROVIDER]),
  validate(createNoteSchema, 'body'),
  AppointmentsController.createConsultationNote
);

export { router as appointmentsRouter };
