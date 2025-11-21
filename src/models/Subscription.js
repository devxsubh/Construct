import mongoose from 'mongoose';
import paginate from './plugins/paginatePlugin.js';
import toJSON from './plugins/toJSONPlugin.js';

const subscriptionSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		planId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Plan',
			required: true
		},
		status: {
			type: String,
			enum: ['active', 'cancelled', 'expired', 'pending'],
			default: 'pending',
			index: true
		},
		razorpaySubscriptionId: {
			type: String,
			trim: true,
			sparse: true
		},
		razorpayOrderId: {
			type: String,
			trim: true
		},
		razorpayPaymentId: {
			type: String,
			trim: true
		},
		currentPeriodStart: {
			type: Date,
			required: true
		},
		currentPeriodEnd: {
			type: Date,
			required: true
		},
		cancelAtPeriodEnd: {
			type: Boolean,
			default: false
		},
		cancelledAt: {
			type: Date
		},
		metadata: {
			type: mongoose.Schema.Types.Mixed,
			default: {}
		}
	},
	{
		timestamps: true
	}
);

subscriptionSchema.plugin(toJSON);
subscriptionSchema.plugin(paginate);

// Indexes
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });
subscriptionSchema.index({ razorpaySubscriptionId: 1 }, { sparse: true });

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function () {
	return this.status === 'active' && new Date() < this.currentPeriodEnd;
};

// Static method to get active subscription for user
subscriptionSchema.statics.getActiveSubscription = async function (userId) {
	return await this.findOne({
		userId,
		status: 'active',
		currentPeriodEnd: { $gt: new Date() }
	}).populate('planId');
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
