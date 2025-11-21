import { Router } from 'express';
import catchAsync from '~/utils/catchAsync';
import validate from '~/middlewares/validate';
import authenticate from '~/middlewares/authenticate';
import userValidation from '~/validations/userValidation';
import userController from '~/controllers/userController';

const router = Router();

// Admin-only routes
router.get('/', authenticate('Admin', 'SuperAdmin'), validate(userValidation.getUsers), catchAsync(userController.getUsers));
router.post('/', authenticate('Admin', 'SuperAdmin'), validate(userValidation.createUser), catchAsync(userController.createUser));
router.get('/:userId', authenticate('Admin', 'SuperAdmin'), validate(userValidation.getUser), catchAsync(userController.getUser));
router.put(
	'/:userId',
	authenticate('Admin', 'SuperAdmin'),
	validate(userValidation.updateUser),
	catchAsync(userController.updateUser)
);
router.delete(
	'/:userId',
	authenticate('Admin', 'SuperAdmin'),
	validate(userValidation.deleteUser),
	catchAsync(userController.deleteUser)
);

export default router;
