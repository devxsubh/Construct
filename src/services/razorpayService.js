import Razorpay from 'razorpay';
import crypto from 'crypto';
import config from '../config/config.js';
import logger from '../config/logger.js';
import APIError from '../utils/apiError.js';
import httpStatus from 'http-status';

// Initialize Razorpay
const razorpay = new Razorpay({
	key_id: config.razorpay.keyId,
	key_secret: config.razorpay.keySecret
});

class RazorpayService {
	/**
	 * Create a Razorpay order
	 * @param {Object} orderData - Order data
	 * @param {number} orderData.amount - Amount in paise
	 * @param {string} orderData.currency - Currency code
	 * @param {string} orderData.receipt - Receipt ID
	 * @param {Object} orderData.notes - Additional notes
	 * @returns {Promise<Object>} - Razorpay order
	 */
	async createOrder(orderData) {
		try {
			const options = {
				amount: orderData.amount,
				currency: orderData.currency || 'INR',
				receipt: orderData.receipt,
				notes: orderData.notes || {}
			};

			const order = await razorpay.orders.create(options);
			logger.info(`Razorpay order created: ${order.id}`);
			return order;
		} catch (error) {
			logger.error('Error creating Razorpay order:', error);
			throw new APIError(`Failed to create payment order: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Verify payment signature
	 * @param {string} orderId - Razorpay order ID
	 * @param {string} paymentId - Razorpay payment ID
	 * @param {string} signature - Payment signature
	 * @returns {Promise<boolean>} - True if signature is valid
	 */
	async verifyPaymentSignature(orderId, paymentId, signature) {
		try {
			const text = `${orderId}|${paymentId}`;
			const generatedSignature = crypto.createHmac('sha256', config.razorpay.keySecret).update(text).digest('hex');

			return generatedSignature === signature;
		} catch (error) {
			logger.error('Error verifying payment signature:', error);
			return false;
		}
	}

	/**
	 * Get payment details
	 * @param {string} paymentId - Razorpay payment ID
	 * @returns {Promise<Object>} - Payment details
	 */
	async getPayment(paymentId) {
		try {
			const payment = await razorpay.payments.fetch(paymentId);
			return payment;
		} catch (error) {
			logger.error('Error fetching payment:', error);
			throw new APIError(`Failed to fetch payment: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Refund payment
	 * @param {string} paymentId - Razorpay payment ID
	 * @param {number} amount - Amount to refund in paise (optional, full refund if not provided)
	 * @returns {Promise<Object>} - Refund details
	 */
	async refundPayment(paymentId, amount = null) {
		try {
			const refundData = {
				payment_id: paymentId
			};

			if (amount) {
				refundData.amount = amount;
			}

			const refund = await razorpay.payments.refund(paymentId, refundData);
			logger.info(`Refund processed: ${refund.id}`);
			return refund;
		} catch (error) {
			logger.error('Error processing refund:', error);
			throw new APIError(`Failed to process refund: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}
}

export default new RazorpayService();
