import MessageEmbedding from '../models/messageEmbedding.js';
import embeddingService from './embeddingService.js';
import logger from '../config/logger.js';
import APIError from '../utils/apiError.js';
import httpStatus from 'http-status';

class ContextService {
	/**
	 * Store message embedding for future retrieval
	 * @param {Object} messageData - Message data
	 * @param {string} messageData.userId - User ID
	 * @param {string} messageData.conversationId - Conversation ID
	 * @param {string} messageData.messageId - Message ID from conversation
	 * @param {string} messageData.role - Message role (user/assistant)
	 * @param {string} messageData.content - Message content
	 * @param {Object} messageData.metadata - Message metadata
	 * @returns {Promise<Object>} - Stored embedding document
	 */
	async storeMessageEmbedding(messageData) {
		try {
			const { userId, conversationId, messageId, role, content, metadata } = messageData;

			// Skip system messages
			if (role === 'system') {
				return null;
			}

			// Generate embedding for the message
			const embedding = await embeddingService.generateEmbedding(content);

			// Store embedding
			const messageEmbedding = new MessageEmbedding({
				userId,
				conversationId,
				messageId,
				role,
				content,
				embedding,
				metadata: metadata || {}
			});

			await messageEmbedding.save();
			logger.debug(`Stored embedding for message ${messageId} in conversation ${conversationId}`);

			return messageEmbedding;
		} catch (error) {
			logger.error('Error storing message embedding:', error);
			// Don't throw error - embedding storage failure shouldn't break the flow
			return null;
		}
	}

	/**
	 * Find semantically similar messages for context
	 * @param {string} queryText - Query text to find similar messages
	 * @param {Object} options - Search options
	 * @param {string} options.userId - User ID
	 * @param {string} options.conversationId - Optional conversation ID to limit search
	 * @param {number} options.limit - Number of results (default: 5)
	 * @param {number} options.threshold - Similarity threshold (default: 0.7)
	 * @param {Array} options.excludeMessageIds - Message IDs to exclude
	 * @param {Object} options.metadataFilter - Metadata filters
	 * @returns {Promise<Array>} - Array of similar messages with similarity scores
	 */
	async findSimilarContext(queryText, options = {}) {
		try {
			const { userId, conversationId, limit = 5, threshold = 0.7, excludeMessageIds = [], metadataFilter = {} } = options;

			if (!userId) {
				throw new APIError('User ID is required', httpStatus.BAD_REQUEST);
			}

			// Generate embedding for query
			const queryEmbedding = await embeddingService.generateEmbedding(queryText);

			// Find similar messages
			const similarMessages = await MessageEmbedding.findSimilar(queryEmbedding, {
				userId,
				conversationId,
				limit,
				threshold,
				excludeMessageIds,
				metadataFilter
			});

			logger.debug(`Found ${similarMessages.length} similar messages for query`);

			return similarMessages;
		} catch (error) {
			logger.error('Error finding similar context:', error);
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError(`Failed to find similar context: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Get relevant context for a query by combining recent messages and semantic search
	 * @param {string} queryText - Query text
	 * @param {Object} options - Options
	 * @returns {Promise<Array>} - Array of relevant messages for context
	 */
	async getRelevantContext(queryText, options = {}) {
		try {
			const { userId, conversationId, recentLimit = 3, semanticLimit = 5, threshold = 0.7 } = options;

			// Get semantically similar messages
			const similarMessages = await this.findSimilarContext(queryText, {
				userId,
				conversationId,
				limit: semanticLimit,
				threshold
			});

			// Format for AI context (combine role and content)
			const contextMessages = similarMessages.map((msg) => ({
				role: msg.role,
				content: msg.content,
				similarity: msg.similarity,
				timestamp: msg.timestamp
			}));

			// Sort by timestamp to maintain chronological order
			contextMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

			return contextMessages;
		} catch (error) {
			logger.error('Error getting relevant context:', error);
			// Return empty array on error - don't break the flow
			return [];
		}
	}

	/**
	 * Store embeddings for multiple messages in batch
	 * @param {Array} messages - Array of message data
	 * @returns {Promise<Array>} - Array of stored embeddings
	 */
	async storeMessageEmbeddingsBatch(messages) {
		try {
			const results = await Promise.allSettled(messages.map((msg) => this.storeMessageEmbedding(msg)));

			const successful = results.filter((r) => r.status === 'fulfilled' && r.value !== null);
			logger.info(`Stored ${successful.length}/${messages.length} message embeddings in batch`);

			return successful.map((r) => r.value);
		} catch (error) {
			logger.error('Error storing batch embeddings:', error);
			return [];
		}
	}

	/**
	 * Delete embeddings for a conversation
	 * @param {string} conversationId - Conversation ID
	 * @returns {Promise<number>} - Number of deleted embeddings
	 */
	async deleteConversationEmbeddings(conversationId) {
		try {
			const result = await MessageEmbedding.deleteMany({ conversationId });
			logger.info(`Deleted ${result.deletedCount} embeddings for conversation ${conversationId}`);
			return result.deletedCount;
		} catch (error) {
			logger.error('Error deleting conversation embeddings:', error);
			return 0;
		}
	}

	/**
	 * Delete embeddings for a specific message
	 * @param {string} messageId - Message ID
	 * @returns {Promise<boolean>} - Success status
	 */
	async deleteMessageEmbedding(messageId) {
		try {
			await MessageEmbedding.deleteOne({ messageId });
			return true;
		} catch (error) {
			logger.error('Error deleting message embedding:', error);
			return false;
		}
	}
}

export default new ContextService();
