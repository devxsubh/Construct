import passport from 'passport';
import httpStatus from 'http-status';
import APIError from '~/utils/apiError';
import Role from '~/models/roleModel';

const verifyCallback = (req, resolve, reject, requiredRights) => async (err, user, info) => {
	if (err || info || !user) {
		return reject(new APIError(httpStatus[httpStatus.UNAUTHORIZED], httpStatus.UNAUTHORIZED));
	}

	// Populate user roles
	if (user.roles && user.roles.length > 0) {
		await user.populate('roles');
	}

	req.user = user;

	// Check role-based permissions if required
	if (requiredRights && requiredRights.length > 0) {
		const userRoles = user.roles || [];
		const roleNames = userRoles.map((role) => role.name);

		// Check if user has required role
		const hasRequiredRole = requiredRights.some((requiredRole) => roleNames.includes(requiredRole));

		if (!hasRequiredRole) {
			return reject(new APIError('Insufficient permissions. Admin access required.', httpStatus.FORBIDDEN));
		}
	}

	return resolve();
};

const authenticate =
	(...requiredRoles) =>
	async (req, res, next) => {
		return new Promise((resolve, reject) => {
			passport.authenticate('jwt', { session: false }, verifyCallback(req, resolve, reject, requiredRoles))(req, res, next);
		})
			.then(() => next())
			.catch((err) => next(err));
	};

// Helper function to check if user has specific role
export const hasRole = (user, requiredRoles) => {
	if (!user || !user.roles || !Array.isArray(user.roles)) {
		return false;
	}

	const userRoleNames = user.roles.map((role) => role.name || role);
	return requiredRoles.some((requiredRole) => userRoleNames.includes(requiredRole));
};

export default authenticate;
