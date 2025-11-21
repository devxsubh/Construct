import mongoose from 'mongoose';
import paginate from './plugins/paginatePlugin.js';
import toJSON from './plugins/toJSONPlugin.js';

const planSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true
		},
		razorpayPlanId: {
			type: String,
			required: false,
			trim: true
		},
		description: {
			type: String,
			required: true,
			trim: true
		},
		price: {
			type: Number,
			required: true,
			min: 0
		},
		currency: {
			type: String,
			default: 'INR',
			enum: ['INR', 'USD', 'EUR']
		},
		interval: {
			type: String,
			required: true,
			enum: ['monthly', 'yearly']
		},
		features: {
			type: [String],
			default: []
		},
		contractLimit: {
			type: Number,
			default: null, // null means unlimited
			min: 0
		},
		isActive: {
			type: Boolean,
			default: true
		},
		sortOrder: {
			type: Number,
			default: 0
		}
	},
	{
		timestamps: true
	}
);

planSchema.plugin(toJSON);
planSchema.plugin(paginate);

// Indexes
planSchema.index({ isActive: 1, sortOrder: 1 });
planSchema.index({ interval: 1 });

const Plan = mongoose.model('Plan', planSchema);

export default Plan;
