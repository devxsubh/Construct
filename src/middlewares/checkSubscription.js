import subscriptionService from '../services/subscriptionService.js';
import APIError from '../utils/apiError.js';
import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';

/**
 * Middleware to check if user can create a contract
 * Blocks contract creation if free tier limit is reached and no active subscription
 */
const checkSubscription = catchAsync(async (req, res, next) => {
	const userId = req.user.id;

	const limitCheck = await subscriptionService.checkContractCreationLimit(userId);

	if (!limitCheck.canCreate) {
		throw new APIError(limitCheck.reason || 'Subscription required to create more contracts', httpStatus.PAYMENT_REQUIRED, {
			remainingFree: limitCheck.remainingFree,
			limit: limitCheck.limit,
			requiresSubscription: true
		});
	}

	// Attach subscription info to request for use in controller
	req.subscriptionInfo = limitCheck;

	next();
});

export default checkSubscription;
