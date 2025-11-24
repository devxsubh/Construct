import Conversation from '../models/conversation.model.js';
import logger from '../config/logger.js';

/**
 * Context Service - Uses conversation history instead of embeddings
 * Provides context for chat conversations using recent messages
 */
class ContextService {
	/**
	 * Get relevant context for a query using conversation history
	 * @param {string} queryText - Query text
	 * @param {Object} options - Options
	 * @param {string} options.userId - User ID
	 * @param {string} options.conversationId - Conversation ID
	 * @param {number} options.recentLimit - Number of recent messages (default: 5)
	 * @returns {Promise<Array>} - Array of relevant messages for context
	 */
	async getRelevantContext(queryText, options = {}) {
		try {
			const { userId, conversationId, recentLimit = 5 } = options;

			if (!userId || !conversationId) {
				return [];
			}

			// Get conversation and recent messages
			const conversation = await Conversation.findOne({
				_id: conversationId,
				userId
			});

			if (!conversation) {
				return [];
			}

			// Get recent messages (conversation history already maintains context)
			const recentMessages = conversation.messages
				.filter((msg) => msg.role !== 'system')
				.slice(-recentLimit)
				.map((msg) => ({
					role: msg.role,
					content: msg.content,
					timestamp: msg.timestamp
				}));

			logger.debug(`Retrieved ${recentMessages.length} recent messages for context`);

			return recentMessages;
		} catch (error) {
			logger.error('Error getting relevant context:', error);
			// Return empty array on error - don't break the flow
			return [];
		}
	}

	/**
	 * Find similar context (deprecated - now uses conversation history)
	 * @param {string} queryText - Query text
	 * @param {Object} options - Options
	 * @returns {Promise<Array>} - Array of messages (uses conversation history)
	 */
	async findSimilarContext(queryText, options = {}) {
		// Use conversation history instead of embeddings
		return this.getRelevantContext(queryText, options);
	}

	/**
	 * Store message embedding (deprecated - messages are stored in Conversation model)
	 * @param {Object} messageData - Message data
	 * @returns {Promise<null>} - No longer stores embeddings
	 */
	async storeMessageEmbedding(messageData) {
		// Messages are already stored in Conversation model
		// No need for separate embedding storage
		logger.debug('Message embedding storage deprecated - using conversation history');
		return null;
	}

	/**
	 * Store embeddings for multiple messages in batch (deprecated)
	 * @param {Array} messages - Array of message data
	 * @returns {Promise<Array>} - Empty array
	 */
	async storeMessageEmbeddingsBatch(messages) {
		// Messages are already stored in Conversation model
		logger.debug('Batch embedding storage deprecated - using conversation history');
		return [];
	}

	/**
	 * Delete embeddings for a conversation (deprecated)
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<number>} - Always returns 0
	 */
	async deleteConversationEmbeddings(conversationId) {
		// No embeddings to delete
		logger.debug('Embedding deletion deprecated - using conversation history');
		return 0;
	}

	/**
	 * Delete embeddings for a specific message (deprecated)
	 * @param {string} messageId - Message ID
	 * @returns {Promise<boolean>} - Always returns true
	 */
	async deleteMessageEmbedding(messageId) {
		// No embeddings to delete
		logger.debug('Message embedding deletion deprecated - using conversation history');
		return true;
	}
}

export default new ContextService();
