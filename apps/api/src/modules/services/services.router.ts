import { Router } from 'express';
import { ServicesController } from './services.controller';
import { validate } from '../../middleware/validate';
import { listServicesQuerySchema } from './services.schemas';

const router = Router();

// Public routes - no authentication required
router.get(
  '/',
  validate(listServicesQuerySchema, 'query'),
  ServicesController.listServices
);

router.get('/:id', ServicesController.getServiceById);

export { router as servicesRouter };
