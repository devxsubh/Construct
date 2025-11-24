import mongoose from 'mongoose';
import toJSON from './plugins/toJSONPlugin.js';

const contractConversationSchema = new mongoose.Schema(
	{
		contractId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Contract',
			required: true,
			unique: true,
			index: true
		},
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true
		},
		// Conversation history for Google AI chat
		history: [
			{
				role: {
					type: String,
					enum: ['user', 'model', 'system'],
					required: true
				},
				parts: {
					type: String,
					required: true
				},
				// Track which blocks were modified (for selective editing)
				modifiedBlocks: [
					{
						blockId: String,
						action: {
							type: String,
							enum: ['modified', 'added', 'deleted']
						}
					}
				],
				timestamp: {
					type: Date,
					default: Date.now
				}
			}
		],
		// Store contract metadata for context
		contractContext: {
			title: String,
			type: String,
			parties: [mongoose.Schema.Types.Mixed],
			jurisdiction: String,
			description: String
		},
		createdAt: {
			type: Date,
			default: Date.now
		},
		updatedAt: {
			type: Date,
			default: Date.now
		}
	},
	{
		timestamps: true
	}
);

// Update timestamp before saving
contractConversationSchema.pre('save', function (next) {
	this.updatedAt = new Date();
	next();
});

// Add indexes for better query performance
contractConversationSchema.index({ contractId: 1, userId: 1 });
contractConversationSchema.index({ userId: 1, updatedAt: -1 });

// Apply plugins
contractConversationSchema.plugin(toJSON);

/**
 * Add message to conversation history
 * @param {string} role - 'user' or 'model'
 * @param {string} parts - Message content
 * @param {Array} modifiedBlocks - Optional: blocks that were modified
 */
contractConversationSchema.methods.addMessage = function (role, parts, modifiedBlocks = []) {
	this.history.push({
		role,
		parts,
		modifiedBlocks,
		timestamp: new Date()
	});
	return this.save();
};

/**
 * Get conversation history formatted for Google AI
 * @returns {Array} - Formatted history for Google AI chat
 */
contractConversationSchema.methods.getFormattedHistory = function () {
	return this.history
		.filter((msg) => msg.role !== 'system')
		.map((msg) => ({
			role: msg.role === 'user' ? 'user' : 'model',
			parts: [{ text: msg.parts }]
		}));
};

/**
 * Get recent messages (last N messages)
 * @param {number} limit - Number of recent messages
 * @returns {Array} - Recent messages
 */
contractConversationSchema.methods.getRecentMessages = function (limit = 10) {
	return this.history.slice(-limit);
};

/**
 * Clear conversation history
 */
contractConversationSchema.methods.clearHistory = function () {
	this.history = [];
	return this.save();
};

const ContractConversation = mongoose.model('ContractConversation', contractConversationSchema);

export default ContractConversation;

