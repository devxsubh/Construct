import Subscription from '../models/Subscription.js';
import Plan from '../models/Plan.js';
import User from '../models/userModel.js';
import razorpayService from './razorpayService.js';
import APIError from '../utils/apiError.js';
import httpStatus from 'http-status';
import logger from '../config/logger.js';

const FREE_CONTRACT_LIMIT = 3;

class SubscriptionService {
	/**
	 * Check if user can create a contract (free tier or active subscription)
	 * @param {string} userId - User ID
	 * @returns {Promise<{canCreate: boolean, reason?: string, remainingFree?: number}>}
	 */
	async checkContractCreationLimit(userId) {
		try {
			const user = await User.findById(userId);
			if (!user) {
				throw new APIError('User not found', httpStatus.NOT_FOUND);
			}

			// Check if user has active subscription
			const activeSubscription = await Subscription.getActiveSubscription(userId);

			if (activeSubscription) {
				// User has active subscription - unlimited contracts
				return {
					canCreate: true,
					hasSubscription: true,
					plan: activeSubscription.planId
				};
			}

			// Check free tier limit
			const contractCount = user.contractCount || 0;
			const remainingFree = FREE_CONTRACT_LIMIT - contractCount;

			if (contractCount >= FREE_CONTRACT_LIMIT) {
				return {
					canCreate: false,
					hasSubscription: false,
					reason: 'Free tier limit reached. Please subscribe to create more contracts.',
					remainingFree: 0,
					limit: FREE_CONTRACT_LIMIT
				};
			}

			return {
				canCreate: true,
				hasSubscription: false,
				remainingFree,
				limit: FREE_CONTRACT_LIMIT
			};
		} catch (error) {
			logger.error('Error checking contract creation limit:', error);
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError('Failed to check subscription status', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Increment contract count for user
	 * @param {string} userId - User ID
	 */
	async incrementContractCount(userId) {
		try {
			await User.findByIdAndUpdate(userId, {
				$inc: { contractCount: 1 }
			});
		} catch (error) {
			logger.error('Error incrementing contract count:', error);
		}
	}

	/**
	 * Get all available plans
	 * @returns {Promise<Array>} - Array of plans
	 */
	async getPlans() {
		try {
			const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 });
			return plans;
		} catch (error) {
			logger.error('Error getting plans:', error);
			throw new APIError('Failed to get subscription plans', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Get plan by ID
	 * @param {string} planId - Plan ID
	 * @returns {Promise<Object>} - Plan object
	 */
	async getPlanById(planId) {
		try {
			const plan = await Plan.findById(planId);
			if (!plan) {
				throw new APIError('Plan not found', httpStatus.NOT_FOUND);
			}
			return plan;
		} catch (error) {
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError('Failed to get plan', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Create subscription order
	 * @param {string} userId - User ID
	 * @param {string} planId - Plan ID
	 * @returns {Promise<Object>} - Order details with Razorpay order
	 */
	async createSubscriptionOrder(userId, planId) {
		try {
			const plan = await this.getPlanById(planId);
			const user = await User.findById(userId);

			if (!user) {
				throw new APIError('User not found', httpStatus.NOT_FOUND);
			}

			// Create Razorpay order
			const razorpayOrder = await razorpayService.createOrder({
				amount: plan.price * 100, // Convert to paise
				currency: plan.currency,
				receipt: `sub_${userId}_${Date.now()}`,
				notes: {
					userId,
					planId: plan._id.toString(),
					planName: plan.name
				}
			});

			// Create subscription record
			const subscription = new Subscription({
				userId,
				planId: plan._id,
				status: 'pending',
				razorpayOrderId: razorpayOrder.id,
				currentPeriodStart: new Date(),
				currentPeriodEnd: this.calculatePeriodEnd(new Date(), plan.interval)
			});

			await subscription.save();

			return {
				subscription,
				order: razorpayOrder,
				plan
			};
		} catch (error) {
			logger.error('Error creating subscription order:', error);
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError('Failed to create subscription order', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Verify and activate subscription after payment
	 * @param {string} subscriptionId - Subscription ID
	 * @param {string} paymentId - Razorpay payment ID
	 * @param {string} signature - Razorpay signature
	 * @returns {Promise<Object>} - Updated subscription
	 */
	async verifyAndActivateSubscription(subscriptionId, paymentId, signature) {
		try {
			const subscription = await Subscription.findById(subscriptionId).populate('planId');
			if (!subscription) {
				throw new APIError('Subscription not found', httpStatus.NOT_FOUND);
			}

			// Verify payment signature
			const isValid = await razorpayService.verifyPaymentSignature(subscription.razorpayOrderId, paymentId, signature);

			if (!isValid) {
				throw new APIError('Invalid payment signature', httpStatus.BAD_REQUEST);
			}

			// Update subscription
			subscription.status = 'active';
			subscription.razorpayPaymentId = paymentId;
			subscription.currentPeriodStart = new Date();
			subscription.currentPeriodEnd = this.calculatePeriodEnd(new Date(), subscription.planId.interval);

			// Update user subscription status
			await User.findByIdAndUpdate(subscription.userId, {
				subscriptionStatus: 'active'
			});

			await subscription.save();

			return subscription;
		} catch (error) {
			logger.error('Error verifying subscription:', error);
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError('Failed to verify subscription', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Get user's active subscription
	 * @param {string} userId - User ID
	 * @returns {Promise<Object|null>} - Active subscription or null
	 */
	async getUserSubscription(userId) {
		try {
			const subscription = await Subscription.getActiveSubscription(userId);
			return subscription;
		} catch (error) {
			logger.error('Error getting user subscription:', error);
			return null;
		}
	}

	/**
	 * Cancel subscription
	 * @param {string} userId - User ID
	 * @returns {Promise<Object>} - Cancelled subscription
	 */
	async cancelSubscription(userId) {
		try {
			const subscription = await Subscription.getActiveSubscription(userId);
			if (!subscription) {
				throw new APIError('No active subscription found', httpStatus.NOT_FOUND);
			}

			subscription.status = 'cancelled';
			subscription.cancelAtPeriodEnd = true;
			subscription.cancelledAt = new Date();

			await subscription.save();

			// Update user subscription status when period ends
			// (or immediately if you want)
			await User.findByIdAndUpdate(userId, {
				subscriptionStatus: 'cancelled'
			});

			return subscription;
		} catch (error) {
			logger.error('Error cancelling subscription:', error);
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError('Failed to cancel subscription', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Calculate period end date
	 * @param {Date} startDate - Start date
	 * @param {string} interval - 'monthly' or 'yearly'
	 * @returns {Date} - End date
	 */
	calculatePeriodEnd(startDate, interval) {
		const endDate = new Date(startDate);
		if (interval === 'monthly') {
			endDate.setMonth(endDate.getMonth() + 1);
		} else if (interval === 'yearly') {
			endDate.setFullYear(endDate.getFullYear() + 1);
		}
		return endDate;
	}

	/**
	 * Get subscription usage stats for user
	 * @param {string} userId - User ID
	 * @returns {Promise<Object>} - Usage stats
	 */
	async getUsageStats(userId) {
		try {
			const user = await User.findById(userId);
			const subscription = await Subscription.getActiveSubscription(userId);

			return {
				contractCount: user.contractCount || 0,
				freeLimit: FREE_CONTRACT_LIMIT,
				remainingFree: Math.max(0, FREE_CONTRACT_LIMIT - (user.contractCount || 0)),
				hasSubscription: !!subscription,
				subscription: subscription
					? {
							plan: subscription.planId,
							periodEnd: subscription.currentPeriodEnd
					  }
					: null
			};
		} catch (error) {
			logger.error('Error getting usage stats:', error);
			throw new APIError('Failed to get usage stats', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}
}

export default new SubscriptionService();
