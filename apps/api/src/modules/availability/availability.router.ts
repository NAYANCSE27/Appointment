import { Router } from 'express';
import { AvailabilityController } from './availability.controller';
import { validate } from '../../middleware/validate';
import { availabilityQuerySchema } from './availability.schemas';

const router = Router();

// Public route - no authentication required
router.get(
  '/',
  validate(availabilityQuerySchema, 'query'),
  AvailabilityController.getAvailableSlots
);

export { router as availabilityRouter };
