import { OpenAI } from 'openai';
import config from '~/config/config';
import Conversation from '../models/conversation.model';
import APIError from '~/utils/apiError';
import httpStatus from 'http-status';
import cacheService from './cacheService';
import aiService from './aiService';
import contextService from './contextService';
import logger from '../config/logger';

// Initialize OpenAI client
const openai = new OpenAI({
	apiKey: config.openai.apiKey
});

class LexiAIService {
	async createConversation(userId, title, description = '') {
		try {
			if (!userId) {
				throw new APIError('User ID is required', httpStatus.BAD_REQUEST);
			}
			if (!title) {
				throw new APIError('Title is required', httpStatus.BAD_REQUEST);
			}

			const conversation = new Conversation({
				userId,
				title,
				description,
				messages: [
					{
						role: 'system',
						content: 'You are a legal document assistant. You help users understand, analyze, and improve legal documents.',
						metadata: {
							type: 'system'
						}
					}
				]
			});
			await conversation.save();
			return conversation;
		} catch (error) {
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError(`Error creating conversation: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	async getConversation(conversationId, userId) {
		try {
			if (!conversationId) {
				throw new APIError('Conversation ID is required', httpStatus.BAD_REQUEST);
			}
			if (!userId) {
				throw new APIError('User ID is required', httpStatus.BAD_REQUEST);
			}

			const conversation = await Conversation.findOne({
				_id: conversationId,
				userId,
				status: { $ne: 'deleted' }
			});

			if (!conversation) {
				throw new APIError('Conversation not found', httpStatus.NOT_FOUND);
			}

			return conversation;
		} catch (error) {
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError(`Error getting conversation: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	async getUserConversations(userId, query = {}) {
		try {
			if (!userId) {
				throw new APIError('User ID is required', httpStatus.BAD_REQUEST);
			}

			const { status = 'active', limit = 10, page = 1, sortBy = 'updatedAt', sortOrder = 'desc' } = query;

			const filter = {
				userId,
				status
			};

			const conversations = await Conversation.find(filter)
				.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
				.skip((page - 1) * limit)
				.limit(limit);

			const total = await Conversation.countDocuments(filter);

			return {
				conversations,
				pagination: {
					total,
					page,
					limit,
					pages: Math.ceil(total / limit)
				}
			};
		} catch (error) {
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError(`Error getting user conversations: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	async addMessage(conversationId, userId, role, content, metadata = {}) {
		try {
			if (!conversationId) {
				throw new APIError('Conversation ID is required', httpStatus.BAD_REQUEST);
			}
			if (!userId) {
				throw new APIError('User ID is required', httpStatus.BAD_REQUEST);
			}
			if (!role) {
				throw new APIError('Message role is required', httpStatus.BAD_REQUEST);
			}
			if (!content) {
				throw new APIError('Message content is required', httpStatus.BAD_REQUEST);
			}

			// Set metadata type based on role if not provided
			if (!metadata.type) {
				metadata.type = role === 'system' ? 'system' : 'chat';
			}

			const conversation = await this.getConversation(conversationId, userId);
			await conversation.addMessage(role, content, metadata);

			// Get the newly added message (last message in array)
			const newMessage = conversation.messages[conversation.messages.length - 1];

			// Generate and store embedding for non-system messages (async, don't wait)
			if (role !== 'system' && newMessage._id) {
				contextService
					.storeMessageEmbedding({
						userId,
						conversationId,
						messageId: newMessage._id,
						role,
						content,
						metadata
					})
					.catch((err) => {
						// Log error but don't fail the message addition
						logger.error('Failed to store message embedding:', err);
					});

				// Mark embedding as generated
				newMessage.embeddingGenerated = true;
				await conversation.save();
			}

			return conversation;
		} catch (error) {
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError(`Error adding message: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	async archiveConversation(conversationId, userId) {
		try {
			if (!conversationId) {
				throw new APIError(httpStatus.BAD_REQUEST, 'Conversation ID is required');
			}
			if (!userId) {
				throw new APIError(httpStatus.BAD_REQUEST, 'User ID is required');
			}

			const conversation = await this.getConversation(conversationId, userId);
			await conversation.archive();
			return conversation;
		} catch (error) {
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, `Error archiving conversation: ${error.message}`);
		}
	}

	async restoreConversation(conversationId, userId) {
		try {
			if (!conversationId) {
				throw new APIError(httpStatus.BAD_REQUEST, 'Conversation ID is required');
			}
			if (!userId) {
				throw new APIError(httpStatus.BAD_REQUEST, 'User ID is required');
			}

			const conversation = await this.getConversation(conversationId, userId);
			await conversation.restore();
			return conversation;
		} catch (error) {
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, `Error restoring conversation: ${error.message}`);
		}
	}

	async processLegalQuery(message, options = {}) {
		const { conversationId, userId, documentType, tone } = options;
		const startTime = Date.now();

		try {
			if (!message) {
				throw new APIError('Message is required', httpStatus.BAD_REQUEST);
			}

			// Analyze the message to determine the intent
			const intent = await this.analyzeIntent(message);

			// Map intent type to valid metadata type
			const metadataType = this.mapIntentToMetadataType(intent.type);

			// Prepare the system message based on intent and options
			const systemMessage = this.prepareSystemMessage(intent, documentType, tone);

			// Get conversation context using semantic search if conversationId is provided
			let contextMessages = [];
			if (conversationId && userId) {
				try {
					// Use semantic search to find relevant context
					const semanticContext = await contextService.getRelevantContext(message, {
						userId,
						conversationId,
						recentLimit: 2,
						semanticLimit: 5,
						threshold: 0.7
					});

					// Also get recent messages as fallback
					const conversation = await this.getConversation(conversationId, userId);
					const recentMessages = conversation.getRecentMessages(3);

					// Combine semantic and recent messages, removing duplicates
					const messageMap = new Map();

					// Add recent messages first (they're more important for continuity)
					recentMessages.forEach((msg) => {
						if (msg.role !== 'system') {
							messageMap.set(msg.content.substring(0, 100), {
								role: msg.role,
								content: msg.content
							});
						}
					});

					// Add semantic context (may override recent if more relevant)
					semanticContext.forEach((msg) => {
						if (msg.role !== 'system') {
							messageMap.set(msg.content.substring(0, 100), {
								role: msg.role,
								content: msg.content
							});
						}
					});

					contextMessages = Array.from(messageMap.values());
				} catch (error) {
					// Fallback to recent messages if semantic search fails
					logger.warn('Semantic search failed, using recent messages:', error.message);
					const conversation = await this.getConversation(conversationId, userId);
					contextMessages = conversation.getRecentMessages(5);
				}
			}

			// Prepare messages for AI
			const messages = [{ role: 'system', content: systemMessage }, ...contextMessages, { role: 'user', content: message }];

			// Provider stickiness and fallback logic
			let provider = conversationId ? await cacheService.getAIProviderForConversation(conversationId) : null;
			if (!provider) provider = 'google'; // Default to Google AI (Gemini)
			let aiResponse;
			let responseTime;
			let usedProvider = provider;

			for (let attempt = 0; attempt < 2; attempt++) {
				try {
					if (provider === 'google') {
						const response = await aiService.generateWithGoogleAI(message, {
							systemPrompt: systemMessage,
							temperature: 0.7,
							maxTokens: 1000
						});
						aiResponse = response;
					} else {
						const response = await aiService.generateWithOpenAI(message, {
							model: 'gpt-4',
							messages,
							systemPrompt: systemMessage,
							temperature: 0.7,
							maxTokens: 1000
						});
						aiResponse = response;
					}
					responseTime = Date.now() - startTime;
					usedProvider = provider;
					// On success, set provider in cache for stickiness
					if (conversationId) await cacheService.setAIProviderForConversation(conversationId, provider);
					break;
				} catch (err) {
					// On first failure, switch provider and retry
					if (attempt === 0) {
						provider = provider === 'google' ? 'openai' : 'google';
						if (conversationId) await cacheService.setAIProviderForConversation(conversationId, provider);
						continue;
					} else {
						throw new APIError(`Error processing legal query: ${err.message}`, httpStatus.INTERNAL_SERVER_ERROR);
					}
				}
			}

			// Extract metadata from response
			const metadata = {
				type: metadataType,
				documentType,
				tone,
				responseTime,
				references: this.extractReferences(aiResponse),
				suggestions: this.extractSuggestions(aiResponse),
				provider: usedProvider
			};

			// Save the interaction if conversationId is provided
			if (conversationId && userId) {
				await this.addMessage(conversationId, userId, 'user', message, { type: metadataType });
				await this.addMessage(conversationId, userId, 'assistant', aiResponse, metadata);
			}

			return {
				text: aiResponse,
				metadata
			};
		} catch (error) {
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError(`Error processing legal query: ${error.message}`, httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	prepareSystemMessage(intent, documentType, tone) {
		let baseMessage = 'You are a legal document assistant. ';

		switch (intent.type) {
			case 'summarize':
				baseMessage += 'Summarize the following text in a clear and concise manner.';
				break;
			case 'explain':
				baseMessage += 'Explain the following legal terms and concepts in plain English.';
				break;
			case 'analyze':
				baseMessage += 'Analyze the following text for potential risks, missing clauses, and enforceability concerns.';
				break;
			case 'suggest':
				baseMessage += `Suggest appropriate ${intent.clauseType} clauses based on the following context.`;
				break;
			case 'adjust':
				baseMessage += `Rewrite the following text in a ${tone || 'formal'} tone while maintaining its legal meaning.`;
				break;
			default:
				baseMessage += 'Provide clear, accurate, and helpful legal information.';
		}

		if (documentType) {
			baseMessage += ` The context is about a ${documentType}.`;
		}

		if (tone) {
			baseMessage += ` Use a ${tone} tone in your response.`;
		}

		return baseMessage;
	}

	async analyzeIntent(message) {
		try {
			const response = await openai.chat.completions.create({
				model: 'gpt-4',
				messages: [
					{
						role: 'system',
						content: 'Analyze this legal query and determine the intent. Return a JSON object with type and confidence.'
					},
					{
						role: 'user',
						content: message
					}
				],
				temperature: 0.3,
				max_tokens: 100
			});

			const result = JSON.parse(response.choices[0].message.content);
			return {
				type: result.type || 'general',
				clauseType: result.clauseType,
				confidence: result.confidence || 0.95
			};
		} catch (error) {
			return {
				type: 'general',
				confidence: 0.95
			};
		}
	}

	extractReferences(text) {
		// Example: Extract references to sections, acts, or case names (very basic regex)
		const references = [];
		if (!text || typeof text !== 'string') return references;

		// Match patterns like 'Section 12 of the Indian Contract Act', 'Article 21', 'Case: Smith v. Jones'
		const sectionRegex = /(Section|Article)\s+\d+[A-Za-z]?\s+(of\s+the\s+[A-Za-z\s]+Act)?/gi;
		const caseRegex = /([A-Z][a-zA-Z]+\s+v\.\s+[A-Z][a-zA-Z]+)/g;
		const actRegex = /[A-Z][a-zA-Z\s]+Act(,?\s*\d{4})?/g;

		const sectionMatches = text.match(sectionRegex) || [];
		const caseMatches = text.match(caseRegex) || [];
		const actMatches = text.match(actRegex) || [];

		references.push(...sectionMatches, ...caseMatches, ...actMatches);
		// Remove duplicates
		return [...new Set(references)];
	}

	extractSuggestions(text) {
		// Example: Extract lines that start with actionable verbs (very basic)
		const suggestions = [];
		if (!text || typeof text !== 'string') return suggestions;

		const lines = text.split(/\r?\n/);
		const actionVerbs = [
			'Consider',
			'Ensure',
			'Review',
			'Verify',
			'Confirm',
			'Add',
			'Remove',
			'Update',
			'Check',
			'Include',
			'Exclude'
		];
		for (const line of lines) {
			for (const verb of actionVerbs) {
				if (line.trim().startsWith(verb)) {
					suggestions.push(line.trim());
					break;
				}
			}
		}
		return suggestions;
	}

	mapIntentToMetadataType(intentType) {
		// Map various intent types to our allowed metadata types
		const typeMap = {
			summarize: 'summarize',
			explain: 'explain',
			analyze: 'analyze',
			suggest: 'suggest',
			adjust: 'adjust',
			InformationRequest: 'chat',
			ClarificationRequest: 'chat',
			GeneralQuery: 'chat',
			LegalAdvice: 'chat',
			DocumentReview: 'analyze',
			RiskAssessment: 'analyze',
			ComplianceCheck: 'analyze',
			ClauseGeneration: 'suggest',
			ToneAdjustment: 'adjust'
		};

		return typeMap[intentType] || 'chat';
	}
}

export default new LexiAIService();
