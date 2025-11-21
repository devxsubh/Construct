import mongoose from 'mongoose';
import paginate from './plugins/paginatePlugin.js';
import toJSON from './plugins/toJSONPlugin.js';

const roleSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			enum: ['User', 'Admin', 'SuperAdmin']
		},
		description: {
			type: String,
			trim: true
		},
		isActive: {
			type: Boolean,
			default: true
		}
	},
	{
		timestamps: true
	}
);

roleSchema.plugin(toJSON);
roleSchema.plugin(paginate);

// Indexes
roleSchema.index({ name: 1 });
roleSchema.index({ isActive: 1 });

const Role = mongoose.model('Role', roleSchema);

export default Role;
