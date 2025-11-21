import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/config.js';
import logger from '../config/logger.js';
import APIError from '../utils/apiError.js';
import httpStatus from 'http-status';

// Initialize OpenAI client
const openai = new OpenAI({
	apiKey: config.openai.apiKey
});

// Initialize Google AI client
const googleAI = config.googleAI.apiKey ? new GoogleGenerativeAI(config.googleAI.apiKey) : null;

class EmbeddingService {
	constructor() {
		this.defaultProvider = 'openai'; // OpenAI embeddings are more reliable
		this.embeddingModel = 'text-embedding-3-small'; // Cost-effective and fast
		this.dimension = 1536; // OpenAI text-embedding-3-small dimension
	}

	/**
	 * Generate embedding for a text using OpenAI
	 * @param {string} text - Text to embed
	 * @returns {Promise<number[]>} - Embedding vector
	 */
	async generateEmbeddingOpenAI(text) {
		try {
			if (!text || typeof text !== 'string' || text.trim().length === 0) {
				throw new Error('Text is required and must be a non-empty string');
			}

			// Truncate text if too long (OpenAI has a limit)
			const maxLength = 8000; // Safe limit for text-embedding-3-small
			const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

			const response = await openai.embeddings.create({
				model: this.embeddingModel,
				input: truncatedText
			});

			return response.data[0].embedding;
		} catch (error) {
			logger.error('Error generating OpenAI embedding:', error);
			throw new APIError(`Failed to generate embedding: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Generate embedding for a text using Google AI
	 * @param {string} text - Text to embed
	 * @returns {Promise<number[]>} - Embedding vector
	 */
	async generateEmbeddingGoogle(text) {
		try {
			if (!googleAI) {
				throw new Error('Google AI not configured');
			}

			if (!text || typeof text !== 'string' || text.trim().length === 0) {
				throw new Error('Text is required and must be a non-empty string');
			}

			// Use embedding-001 model
			const model = googleAI.getGenerativeModel({ model: 'embedding-001' });
			const result = await model.embedContent(text);

			return result.embedding.values;
		} catch (error) {
			logger.error('Error generating Google AI embedding:', error);
			throw new APIError(`Failed to generate embedding: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Generate embedding with automatic fallback
	 * @param {string} text - Text to embed
	 * @param {string} provider - Preferred provider ('openai' or 'google')
	 * @returns {Promise<number[]>} - Embedding vector
	 */
	async generateEmbedding(text, provider = this.defaultProvider) {
		try {
			// Try preferred provider first
			if (provider === 'openai') {
				try {
					return await this.generateEmbeddingOpenAI(text);
				} catch (error) {
					logger.warn('OpenAI embedding failed, trying Google AI:', error.message);
					if (googleAI) {
						return await this.generateEmbeddingGoogle(text);
					}
					throw error;
				}
			} else if (provider === 'google' && googleAI) {
				try {
					return await this.generateEmbeddingGoogle(text);
				} catch (error) {
					logger.warn('Google AI embedding failed, trying OpenAI:', error.message);
					return await this.generateEmbeddingOpenAI(text);
				}
			} else {
				// Default to OpenAI
				return await this.generateEmbeddingOpenAI(text);
			}
		} catch (error) {
			logger.error('All embedding providers failed:', error);
			throw error;
		}
	}

	/**
	 * Generate embeddings for multiple texts in batch
	 * @param {string[]} texts - Array of texts to embed
	 * @param {string} provider - Provider to use
	 * @returns {Promise<number[][]>} - Array of embedding vectors
	 */
	async generateEmbeddingsBatch(texts, provider = this.defaultProvider) {
		try {
			if (!Array.isArray(texts) || texts.length === 0) {
				throw new Error('Texts must be a non-empty array');
			}

			// OpenAI supports batch embeddings
			if (provider === 'openai' || !googleAI) {
				try {
					const response = await openai.embeddings.create({
						model: this.embeddingModel,
						input: texts.map((text) => (text.length > 8000 ? text.substring(0, 8000) : text))
					});
					return response.data.map((item) => item.embedding);
				} catch (error) {
					logger.warn('OpenAI batch embedding failed, falling back to individual:', error.message);
					// Fallback to individual embeddings
					return Promise.all(texts.map((text) => this.generateEmbedding(text, provider)));
				}
			} else {
				// Google AI - process individually
				return Promise.all(texts.map((text) => this.generateEmbedding(text, provider)));
			}
		} catch (error) {
			logger.error('Error generating batch embeddings:', error);
			throw new APIError(`Failed to generate batch embeddings: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Calculate cosine similarity between two vectors
	 * @param {number[]} vec1 - First vector
	 * @param {number[]} vec2 - Second vector
	 * @returns {number} - Similarity score (0-1)
	 */
	cosineSimilarity(vec1, vec2) {
		if (!vec1 || !vec2 || vec1.length !== vec2.length) {
			return 0;
		}

		let dotProduct = 0;
		let norm1 = 0;
		let norm2 = 0;

		for (let i = 0; i < vec1.length; i++) {
			dotProduct += vec1[i] * vec2[i];
			norm1 += vec1[i] * vec1[i];
			norm2 += vec2[i] * vec2[i];
		}

		const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
		if (denominator === 0) return 0;

		return dotProduct / denominator;
	}

	/**
	 * Normalize a vector (L2 normalization)
	 * @param {number[]} vector - Vector to normalize
	 * @returns {number[]} - Normalized vector
	 */
	normalizeVector(vector) {
		const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
		if (magnitude === 0) return vector;
		return vector.map((val) => val / magnitude);
	}

	/**
	 * Get embedding dimension
	 * @returns {number} - Dimension of embeddings
	 */
	getDimension() {
		return this.dimension;
	}
}

export default new EmbeddingService();
