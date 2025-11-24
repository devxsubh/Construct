import subscriptionService from '../services/subscriptionService.js';
import APIError from '../utils/apiError.js';
import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import config from '../config/config.js';

/**
 * Middleware to check if user can create a contract
 * Blocks contract creation if free tier limit is reached and no active subscription
 * Skips limit check in development mode
 */
const checkSubscription = catchAsync(async (req, res, next) => {
	// Skip subscription check in development mode
	if (config.NODE_ENV === 'development') {
		// Attach unlimited subscription info for development
		req.subscriptionInfo = {
			canCreate: true,
			remainingFree: Infinity,
			limit: Infinity,
			requiresSubscription: false
		};
		return next();
	}

	const userId = req.user.id;

	const limitCheck = await subscriptionService.checkContractCreationLimit(userId);

	if (!limitCheck.canCreate) {
		const error = new APIError(
			limitCheck.reason || 'Subscription required to create more contracts',
			httpStatus.PAYMENT_REQUIRED,
			true, // isOperational
			{
				remainingFree: limitCheck.remainingFree,
				limit: limitCheck.limit,
				requiresSubscription: true
			}
		);
		throw error;
	}

	// Attach subscription info to request for use in controller
	req.subscriptionInfo = limitCheck;

	next();
});

export default checkSubscription;
