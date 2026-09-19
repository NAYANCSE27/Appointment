import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import {
  updateProfileSchema,
  changePasswordSchema,
  changeEmailSchema,
} from './users.schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/me', usersController.getMyProfile.bind(usersController));
router.patch('/me', validate(updateProfileSchema), usersController.updateMyProfile.bind(usersController));
router.post('/me/change-password', validate(changePasswordSchema), usersController.changePassword.bind(usersController));
router.post('/me/change-email', validate(changeEmailSchema), usersController.changeEmail.bind(usersController));
router.post('/me/avatar', usersController.uploadAvatar.bind(usersController));
router.delete('/me/oauth/:provider', usersController.disconnectOAuth.bind(usersController));

export { router as usersRouter };
