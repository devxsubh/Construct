import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/config.js';
import cacheService from './cacheService.js';
import logger from '../config/logger.js';

// Initialize AI clients
const googleAI = config.googleAI.apiKey ? new GoogleGenerativeAI(config.googleAI.apiKey) : null;

class AIService {
	constructor() {
		this.providers = ['google'];
		this.currentProvider = 0; // Start with Google AI (Gemini)
	}

	// Get next available provider
	getNextProvider() {
		this.currentProvider = (this.currentProvider + 1) % this.providers.length;
		return this.providers[this.currentProvider];
	}

	// Generate contract content using Google AI (Gemini)
	async generateWithGoogleAI(prompt, options = {}) {
		if (!googleAI) {
			throw new Error('Google AI not configured');
		}

		// Try different model names in order of preference
		const modelNames = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-pro'];

		for (const modelName of modelNames) {
			try {
				const model = googleAI.getGenerativeModel({
					model: modelName
				});

				const result = await model.generateContent([
					options.systemPrompt || 'You are a legal contract expert. Generate professional, legally sound contracts.',
					prompt
				]);

				const response = await result.response;
				return response.text();
			} catch (error) {
				logger.warn(`Google AI model ${modelName} failed:`, error.message);
				// Continue to next model if this one fails
				continue;
			}
		}

		// If all models fail, throw the last error
		throw new Error('All Google AI models failed');
	}

	/**
	 * Generate content with conversation history (for iterative editing)
	 * @param {string} prompt - User's prompt
	 * @param {Array} history - Conversation history (from ContractConversation)
	 * @param {Object} options - Generation options
	 * @returns {Promise<Object>} - Response text and updated history
	 */
	async generateWithChatHistory(prompt, history = [], options = {}) {
		if (!googleAI) {
			throw new Error('Google AI not configured');
		}

		const modelNames = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-pro'];

		for (const modelName of modelNames) {
			try {
				const model = googleAI.getGenerativeModel({
					model: modelName,
					systemInstruction: options.systemPrompt || 'You are a legal contract expert. Generate professional, legally sound contracts.'
				});

				// Convert history to Google AI format
				const chatHistory = history
					.filter((msg) => msg.role !== 'system')
					.map((msg) => ({
						role: msg.role === 'user' ? 'user' : 'model',
						parts: [{ text: msg.parts }]
					}));

				// Start chat with history
				const chat = model.startChat({
					history: chatHistory
				});

				// Send new message
				const result = await chat.sendMessage(prompt);
				const response = await result.response;
				const responseText = response.text();

				// Return response and updated history
				return {
					text: responseText,
					history: [
						...history,
						{ role: 'user', parts: prompt },
						{ role: 'model', parts: responseText }
					]
				};
			} catch (error) {
				logger.warn(`Google AI model ${modelName} failed:`, error.message);
				continue;
			}
		}

		throw new Error('All Google AI models failed');
	}

	// Generate content with caching
	async generateContent(prompt, options = {}) {
		// Check cache first
		const cachedResponse = await cacheService.getCachedAIResponse(prompt);
		if (cachedResponse) {
			logger.info('Using cached AI response');
			return cachedResponse;
		}

		// Use Google AI
		try {
			const response = await this.generateWithGoogleAI(prompt, options);
			
			// Cache the successful response
			await cacheService.cacheAIResponse(prompt, response, options.cacheTTL || 3600);

			return response;
		} catch (error) {
			logger.error('Google AI failed:', error.message);
			throw error;
		}
	}

	// Generate contract sections with caching
	async generateContractSections(contractType, parties) {
		const prompt = `Generate contract sections for a ${contractType} contract with ${parties.length} parties. Include all necessary legal sections.`;

		try {
			const response = await this.generateContent(prompt, {
				systemPrompt: 'You are a legal expert. Generate comprehensive contract sections in JSON format.',
				temperature: 0.5
			});

			// Parse response as JSON or return as sections
			try {
				return JSON.parse(response);
			} catch {
				// If not JSON, return as structured sections
				return this.parseSectionsFromText(response);
			}
		} catch (error) {
			logger.error('Error generating contract sections:', error);
			return this.getFallbackSections(contractType);
		}
	}

	// Rewrite section with AI
	async rewriteSection(sectionContent, style) {
		const prompt = `Rewrite the following contract section in ${style} style:\n\n${sectionContent}`;

		try {
			return await this.generateContent(prompt, {
				systemPrompt: 'You are a legal writing expert. Rewrite contract sections while maintaining legal accuracy.',
				temperature: 0.6
			});
		} catch (error) {
			logger.error('Error rewriting section:', error);
			return sectionContent; // Return original if AI fails
		}
	}

	// Suggest clause
	async suggestClause(context, type) {
		const prompt = `Suggest a ${type} clause for the following contract context:\n\n${context}`;

		try {
			return await this.generateContent(prompt, {
				systemPrompt: 'You are a legal expert. Suggest appropriate contract clauses.',
				temperature: 0.7
			});
		} catch (error) {
			logger.error('Error suggesting clause:', error);
			return this.getFallbackClause(type);
		}
	}

	// Parse sections from text response
	parseSectionsFromText(text) {
		const sections = text.split(/\n(?=[A-Z][A-Za-z\s]+:)/);
		return sections.map((section, index) => {
			const [title, ...contentParts] = section.split('\n');
			return {
				title: title.replace(':', '').trim(),
				content: contentParts.join('\n').trim(),
				order: index + 1
			};
		});
	}

	// Fallback sections
	getFallbackSections(contractType) {
		return [
			{ title: 'Parties', content: 'Contract parties information', order: 1 },
			{ title: 'Term', content: 'Contract duration and terms', order: 2 },
			{ title: 'Obligations', content: 'Party obligations and responsibilities', order: 3 },
			{ title: 'Payment Terms', content: 'Payment schedules and methods', order: 4 },
			{ title: 'Termination', content: 'Contract termination conditions', order: 5 },
			{ title: 'Miscellaneous', content: 'Standard boilerplate clauses', order: 6 }
		];
	}

	// Fallback clause
	getFallbackClause(type) {
		const clauses = {
			confidentiality: 'All parties agree to maintain the confidentiality of proprietary information.',
			termination: 'This agreement may be terminated by either party with written notice.',
			payment: 'Payment shall be made according to the terms specified in this agreement.',
			liability: 'Liability shall be limited to the extent permitted by applicable law.',
			default: 'Standard legal clause for the specified context.'
		};

		return clauses[type] || clauses.default;
	}

	// Health check for all providers
	async healthCheck() {
		const results = {};

		if (googleAI) {
			try {
				// Try different model names for health check
				const modelNames = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-pro'];
				let success = false;

				for (const modelName of modelNames) {
					try {
						const model = googleAI.getGenerativeModel({ model: modelName });
						await model.generateContent('test');
						success = true;
						break;
					} catch (error) {
						logger.warn(`Health check failed for model ${modelName}:`, error.message);
						continue;
					}
				}

				results.google = success;
			} catch (error) {
				results.google = false;
			}
		} else {
			results.google = false;
		}

		return results;
	}
}

export default new AIService();
