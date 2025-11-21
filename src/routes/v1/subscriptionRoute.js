import { Router } from 'express';
import subscriptionController from '../../controllers/subscriptionController.js';
import authenticate from '../../middlewares/authenticate.js';
import catchAsync from '../../utils/catchAsync.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all available plans
router.get('/plans', catchAsync(subscriptionController.getPlans));

// Get user's subscription status
router.get('/my-subscription', catchAsync(subscriptionController.getMySubscription));

// Get active subscription
router.get('/active', catchAsync(subscriptionController.getActiveSubscription));

// Create subscription order
router.post('/create-order', catchAsync(subscriptionController.createSubscriptionOrder));

// Verify payment and activate subscription
router.post('/verify-payment', catchAsync(subscriptionController.verifyPayment));

// Cancel subscription
router.post('/cancel', catchAsync(subscriptionController.cancelSubscription));

export default router;
