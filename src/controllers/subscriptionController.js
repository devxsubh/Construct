import subscriptionService from '../services/subscriptionService.js';
import catchAsync from '../utils/catchAsync.js';
import httpStatus from 'http-status';
import APIError from '../utils/apiError.js';

class SubscriptionController {
	/**
	 * Get all available subscription plans
	 */
	getPlans = catchAsync(async (req, res) => {
		const plans = await subscriptionService.getPlans();
		res.status(httpStatus.OK).json({
			success: true,
			data: plans
		});
	});

	/**
	 * Get user's subscription status and usage
	 */
	getMySubscription = catchAsync(async (req, res) => {
		const usageStats = await subscriptionService.getUsageStats(req.user.id);
		res.status(httpStatus.OK).json({
			success: true,
			data: usageStats
		});
	});

	/**
	 * Create subscription order
	 */
	createSubscriptionOrder = catchAsync(async (req, res) => {
		const { planId } = req.body;

		if (!planId) {
			throw new APIError('Plan ID is required', httpStatus.BAD_REQUEST);
		}

		const result = await subscriptionService.createSubscriptionOrder(req.user.id, planId);

		res.status(httpStatus.CREATED).json({
			success: true,
			data: {
				subscription: result.subscription,
				order: {
					id: result.order.id,
					amount: result.order.amount,
					currency: result.order.currency,
					key: process.env.RAZORPAY_KEY_ID
				},
				plan: result.plan
			}
		});
	});

	/**
	 * Verify payment and activate subscription
	 */
	verifyPayment = catchAsync(async (req, res) => {
		const { subscriptionId, paymentId, signature } = req.body;

		if (!subscriptionId || !paymentId || !signature) {
			throw new APIError('Subscription ID, payment ID, and signature are required', httpStatus.BAD_REQUEST);
		}

		const subscription = await subscriptionService.verifyAndActivateSubscription(subscriptionId, paymentId, signature);

		res.status(httpStatus.OK).json({
			success: true,
			message: 'Subscription activated successfully',
			data: subscription
		});
	});

	/**
	 * Cancel subscription
	 */
	cancelSubscription = catchAsync(async (req, res) => {
		const subscription = await subscriptionService.cancelSubscription(req.user.id);

		res.status(httpStatus.OK).json({
			success: true,
			message: 'Subscription cancelled successfully',
			data: subscription
		});
	});

	/**
	 * Get user's active subscription
	 */
	getActiveSubscription = catchAsync(async (req, res) => {
		const subscription = await subscriptionService.getUserSubscription(req.user.id);

		res.status(httpStatus.OK).json({
			success: true,
			data: subscription
		});
	});
}

export default new SubscriptionController();
