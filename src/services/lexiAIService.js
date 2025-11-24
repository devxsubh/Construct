import Conversation from '../models/conversation.model';
import APIError from '~/utils/apiError';
import httpStatus from 'http-status';
import aiService from './aiService';

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

			// Messages are stored in conversation history (no embedding needed)
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

			// Use Google AI with conversation history if available
			let aiResponse;
			let responseTime;
			const usedProvider = 'google';

			try {
				// Get conversation history if conversationId exists
				let history = [];
				if (conversationId && userId) {
					const conversation = await this.getConversation(conversationId, userId);
					if (conversation) {
						// Format history for Google AI
						history = conversation.messages
							.filter((msg) => msg.role !== 'system')
							.map((msg) => ({
								role: msg.role === 'user' ? 'user' : 'model',
								parts: msg.content
							}));
					}
				}

				// Use chat history if available, otherwise use simple generation
				if (history.length > 0) {
					const result = await aiService.generateWithChatHistory(message, history, {
						systemPrompt: systemMessage,
						temperature: 0.7
					});
					aiResponse = result.text;
				} else {
					const response = await aiService.generateWithGoogleAI(message, {
						systemPrompt: systemMessage,
						temperature: 0.7,
						maxTokens: 1000
					});
					aiResponse = response;
				}
				responseTime = Date.now() - startTime;
			} catch (err) {
				throw new APIError(`Error processing legal query: ${err.message}`, httpStatus.INTERNAL_SERVER_ERROR);
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
			const responseText = await aiService.generateWithGoogleAI(message, {
				systemPrompt: 'Analyze this legal query and determine the intent. Return a JSON object with type and confidence.',
				temperature: 0.3,
				maxTokens: 500
			});

			// Parse JSON response
			let result;
			try {
				result = JSON.parse(responseText);
			} catch {
				// If not JSON, try to extract JSON from text
				const jsonMatch = responseText.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					result = JSON.parse(jsonMatch[0]);
				} else {
					throw new Error('Invalid response format');
				}
			}

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
