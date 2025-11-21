import Role from '../models/roleModel.js';
import catchAsync from '../utils/catchAsync.js';
import httpStatus from 'http-status';
import APIError from '../utils/apiError.js';
import { hasRole } from '../middlewares/authenticate.js';

class RoleController {
	/**
	 * Get all roles (Admin only)
	 */
	getRoles = catchAsync(async (req, res) => {
		if (!hasRole(req.user, ['Admin', 'SuperAdmin'])) {
			throw new APIError('Admin access required', httpStatus.FORBIDDEN);
		}

		const roles = await Role.find({ isActive: true }).sort({ name: 1 });
		res.status(httpStatus.OK).json({
			success: true,
			data: roles
		});
	});

	/**
	 * Get role by ID (Admin only)
	 */
	getRoleById = catchAsync(async (req, res) => {
		if (!hasRole(req.user, ['Admin', 'SuperAdmin'])) {
			throw new APIError('Admin access required', httpStatus.FORBIDDEN);
		}

		const role = await Role.findById(req.params.roleId);
		if (!role) {
			throw new APIError('Role not found', httpStatus.NOT_FOUND);
		}

		res.status(httpStatus.OK).json({
			success: true,
			data: role
		});
	});
}

export default new RoleController();
