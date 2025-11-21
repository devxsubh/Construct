import { Router } from 'express';
import roleController from '../../controllers/roleController.js';
import authenticate from '../../middlewares/authenticate.js';
import catchAsync from '../../utils/catchAsync.js';

const router = Router();

// All routes require admin authentication
router.use(authenticate('Admin', 'SuperAdmin'));

// Get all roles
router.get('/', catchAsync(roleController.getRoles));

// Get role by ID
router.get('/:roleId', catchAsync(roleController.getRoleById));

export default router;
