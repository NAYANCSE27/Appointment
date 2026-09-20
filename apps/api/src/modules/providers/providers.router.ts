import { Router } from 'express';
import { ProvidersController } from './providers.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { Role } from '@prisma/client';
import {
  updateScheduleSchema,
  createExceptionSchema,
  listProvidersQuerySchema,
  listExceptionsQuerySchema,
  listProviderAppointmentsQuerySchema,
} from './providers.schemas';

const router = Router();

// Public routes - no authentication required
router.get(
  '/',
  validate(listProvidersQuerySchema, 'query'),
  ProvidersController.listProviders
);

router.get('/:id', ProvidersController.getProviderById);

// Protected routes - Provider role required
router.get(
  '/me/schedule',
  authenticate,
  authorize([Role.PROVIDER]),
  ProvidersController.getMySchedule
);

router.put(
  '/me/schedule',
  authenticate,
  authorize([Role.PROVIDER]),
  validate(updateScheduleSchema, 'body'),
  ProvidersController.updateMySchedule
);

router.get(
  '/me/exceptions',
  authenticate,
  authorize([Role.PROVIDER]),
  validate(listExceptionsQuerySchema, 'query'),
  ProvidersController.getMyExceptions
);

router.post(
  '/me/exceptions',
  authenticate,
  authorize([Role.PROVIDER]),
  validate(createExceptionSchema, 'body'),
  ProvidersController.createException
);

router.delete(
  '/me/exceptions/:id',
  authenticate,
  authorize([Role.PROVIDER]),
  ProvidersController.deleteException
);

router.get(
  '/me/appointments',
  authenticate,
  authorize([Role.PROVIDER]),
  validate(listProviderAppointmentsQuerySchema, 'query'),
  ProvidersController.getMyAppointments
);

export { router as providersRouter };
