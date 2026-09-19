import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate, authorize } from '../../middleware';
import { validate } from '../../middleware/validate';
import { Role } from '@prisma/client';
import {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminListUsersQuerySchema,
  adminCreateServiceSchema,
  adminUpdateServiceSchema,
  adminCreateProviderSchema,
  adminUpdateProviderSchema,
  adminUpdateTenantSettingsSchema,
  adminCreateHolidaySchema,
  adminCreateWorkingHoursSchema,
} from './admin.schemas';

const router = Router();

// All routes require authentication and ADMIN role
router.use(authenticate);
router.use(authorize([Role.ADMIN]));

// ==================== User Management ====================

router.get(
  '/users',
  validate(adminListUsersQuerySchema, 'query'),
  adminController.listUsers.bind(adminController)
);
router.post(
  '/users',
  validate(adminCreateUserSchema),
  adminController.createUser.bind(adminController)
);
router.get('/users/:id', adminController.getUserById.bind(adminController));
router.patch(
  '/users/:id',
  validate(adminUpdateUserSchema),
  adminController.updateUser.bind(adminController)
);
router.post('/users/:id/suspend', adminController.suspendUser.bind(adminController));
router.post('/users/:id/reactivate', adminController.reactivateUser.bind(adminController));
router.delete('/users/:id', adminController.anonymizeUser.bind(adminController));
router.post('/users/:id/reset-password', adminController.sendPasswordReset.bind(adminController));

// ==================== Service Management ====================

router.get('/services', adminController.listServices.bind(adminController));
router.post(
  '/services',
  validate(adminCreateServiceSchema),
  adminController.createService.bind(adminController)
);
router.get('/services/:id', adminController.getServiceById.bind(adminController));
router.patch(
  '/services/:id',
  validate(adminUpdateServiceSchema),
  adminController.updateService.bind(adminController)
);
router.delete('/services/:id', adminController.deactivateService.bind(adminController));

// ==================== Provider Management ====================

router.get('/providers', adminController.listProviders.bind(adminController));
router.post(
  '/providers',
  validate(adminCreateProviderSchema),
  adminController.createProvider.bind(adminController)
);
router.get('/providers/:id', adminController.getProviderById.bind(adminController));
router.patch(
  '/providers/:id',
  validate(adminUpdateProviderSchema),
  adminController.updateProvider.bind(adminController)
);
router.post('/providers/:id/deactivate', adminController.deactivateProvider.bind(adminController));

// ==================== Settings Management ====================

router.get('/settings', adminController.getSettings.bind(adminController));
router.put(
  '/settings',
  validate(adminUpdateTenantSettingsSchema),
  adminController.updateSettings.bind(adminController)
);

router.get('/settings/working-hours', adminController.getWorkingHours.bind(adminController));
router.post(
  '/settings/working-hours',
  validate(adminCreateWorkingHoursSchema),
  adminController.setWorkingHours.bind(adminController)
);

router.get('/settings/holidays', adminController.getHolidays.bind(adminController));
router.post(
  '/settings/holidays',
  validate(adminCreateHolidaySchema),
  adminController.createHoliday.bind(adminController)
);
router.delete('/settings/holidays/:id', adminController.deleteHoliday.bind(adminController));

// ==================== Notification Templates ====================

router.get(
  '/notifications/templates',
  adminController.listNotificationTemplates.bind(adminController)
);
router.patch(
  '/notifications/templates/:id',
  adminController.updateNotificationTemplate.bind(adminController)
);

export { router as adminRouter };
