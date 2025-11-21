import aiService from './aiService.js';
import logger from '../config/logger.js';
import APIError from '../utils/apiError.js';
import httpStatus from 'http-status';

class ContractGenerationService {
	/**
	 * Extract contract details from a simple text prompt
	 * @param {string} prompt - User's text prompt describing the contract
	 * @returns {Promise<Object>} - Extracted contract details
	 */
	async extractContractDetails(prompt) {
		try {
			const extractionPrompt = `Extract contract details from the following user request. Return ONLY a valid JSON object with the following structure:
{
  "title": "Contract title",
  "type": "contract type (e.g., service_agreement, employment, nda, partnership)",
  "description": "Brief description",
  "parties": [
    {
      "name": "Party name",
      "role": "Party role (e.g., Service Provider, Client, Employer, Employee)",
      "email": "party@email.com"
    }
  ],
  "jurisdiction": "India (default if not specified)",
  "startDate": "YYYY-MM-DD (default to today if not specified)",
  "endDate": "YYYY-MM-DD (default to 1 year from start if not specified)",
  "keyTerms": ["term1", "term2"],
  "tone": "formal"
}

User request: "${prompt}"

IMPORTANT: 
- Extract all parties mentioned (at least 2 parties required)
- If dates are not mentioned, use defaults
- If jurisdiction is not mentioned, default to "India"
- Return ONLY the JSON object, no additional text`;

			const response = await aiService.generateContent(extractionPrompt, {
				systemPrompt:
					'You are a contract information extraction expert. Extract contract details from user requests and return ONLY valid JSON.',
				temperature: 0.3,
				maxTokens: 2000
			});

			// Clean and parse JSON response
			let cleanedResponse = response.trim();

			// Remove markdown code blocks if present
			cleanedResponse = cleanedResponse.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');

			// Try to extract JSON from response
			const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				cleanedResponse = jsonMatch[0];
			}

			const extracted = JSON.parse(cleanedResponse);

			// Validate and set defaults
			if (!extracted.parties || extracted.parties.length < 2) {
				throw new APIError('At least 2 parties are required for a contract', httpStatus.BAD_REQUEST);
			}

			// Set defaults
			const today = new Date();
			const oneYearLater = new Date(today);
			oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

			extracted.startDate = extracted.startDate || today.toISOString().split('T')[0];
			extracted.endDate = extracted.endDate || oneYearLater.toISOString().split('T')[0];
			extracted.jurisdiction = extracted.jurisdiction || 'India';
			extracted.type = extracted.type || 'service_agreement';
			extracted.tone = extracted.tone || 'formal';

			// Ensure all parties have required fields
			extracted.parties = extracted.parties.map((party, index) => ({
				name: party.name || `Party ${index + 1}`,
				role: party.role || (index === 0 ? 'Service Provider' : 'Client'),
				email: party.email || `party${index + 1}@example.com`
			}));

			return extracted;
		} catch (error) {
			logger.error('Error extracting contract details:', error);
			if (error instanceof APIError) {
				throw error;
			}
			if (error instanceof SyntaxError) {
				throw new APIError('Failed to parse contract details. Please provide a clearer description.', httpStatus.BAD_REQUEST);
			}
			throw new APIError('Failed to extract contract details from prompt', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Generate contract content from extracted details
	 * @param {Object} contractDetails - Extracted contract details
	 * @returns {Promise<string>} - Generated contract HTML content
	 */
	async generateContractFromDetails(contractDetails) {
		try {
			const { title, type, description, parties, jurisdiction, startDate, endDate, keyTerms, tone } = contractDetails;

			const generationPrompt = `Generate a complete legal contract based on the following details:

Title: ${title}
Type: ${type}
Description: ${description}
Parties: ${parties.map((p) => `${p.name} (${p.role}) - ${p.email}`).join(', ')}
Jurisdiction: ${jurisdiction}
Start Date: ${startDate}
End Date: ${endDate}
Key Terms: ${keyTerms ? keyTerms.join(', ') : 'Standard terms'}
Tone: ${tone}

Generate a comprehensive, legally sound contract in BlockNote JSON format. Return ONLY a valid JSON array of blocks.

BlockNote format structure:
- Each block is an object with "type" and "content" properties
- Supported block types: "paragraph", "heading", "quote", "bulletListItem", "numberedListItem", "checkListItem"
- Headings can have props: { "level": 1-3 }
- Content can be a string (for simple text) or an array of inline content objects
- Inline content objects have: { "type": "text", "text": "...", "styles": { "bold": true, "italic": true } }

Include these sections:
1. Title as heading (level 1)
2. Date as paragraph
3. Parties section as heading (level 2) with party details as bullet list items
4. Definitions section (if needed) as heading (level 2) with definitions as numbered list
5. Main terms and conditions as headings (level 2) with paragraphs
6. Obligations section as heading (level 2) with bullet list items
7. Payment terms (if applicable) as heading (level 2) with paragraphs
8. Confidentiality clause (if applicable) as heading (level 2) with paragraphs
9. Termination clause as heading (level 2) with paragraphs
10. Dispute resolution as heading (level 2) with paragraphs
11. Governing law as heading (level 2) with paragraphs
12. Miscellaneous clauses as heading (level 2) with paragraphs

IMPORTANT: 
- Return ONLY a valid JSON array, no additional text or markdown
- Each block must be a valid BlockNote block object
- Use appropriate block types for different content
- Make it professional and legally appropriate for ${jurisdiction} jurisdiction`;

			const contractContent = await aiService.generateContent(generationPrompt, {
				systemPrompt:
					'You are a legal contract expert. Generate professional, legally sound contracts in BlockNote JSON format. Return ONLY a valid JSON array of blocks, no additional text.',
				temperature: 0.7,
				maxTokens: 4000
			});

			// Parse and validate BlockNote format
			return this.parseBlockNoteContent(contractContent);
		} catch (error) {
			logger.error('Error generating contract content:', error);
			throw new APIError('Failed to generate contract content', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Generate complete contract from a simple text prompt
	 * @param {string} prompt - User's text prompt
	 * @returns {Promise<Object>} - Complete contract data ready to save
	 */
	async generateContractFromPrompt(prompt) {
		try {
			// Step 1: Extract contract details from prompt
			const contractDetails = await this.extractContractDetails(prompt);

			// Step 2: Generate contract content
			const contractContent = await this.generateContractFromDetails(contractDetails);

			// Step 3: Return complete contract data
			// Content is already in BlockNote format
			return {
				title: contractDetails.title,
				type: contractDetails.type,
				description: contractDetails.description,
				parties: contractDetails.parties,
				jurisdiction: contractDetails.jurisdiction,
				startDate: new Date(contractDetails.startDate),
				endDate: new Date(contractDetails.endDate),
				content: contractContent // BlockNote format (array of blocks)
			};
		} catch (error) {
			logger.error('Error generating contract from prompt:', error);
			if (error instanceof APIError) {
				throw error;
			}
			throw new APIError('Failed to generate contract from prompt', httpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	/**
	 * Clean HTML response to remove document structure
	 * @param {string} htmlResponse - Raw HTML response
	 * @returns {string} - Cleaned HTML content
	 */
	cleanHtmlResponse(htmlResponse) {
		if (!htmlResponse) {
			return '<p>Contract content will be generated here.</p>';
		}

		let cleaned = htmlResponse.trim();

		// Remove markdown code blocks
		cleaned = cleaned.replace(/```html\s*/gi, '').replace(/```\s*$/gi, '');

		// Remove document structure tags
		cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
		cleaned = cleaned.replace(/<html[^>]*>/gi, '');
		cleaned = cleaned.replace(/<\/html>/gi, '');
		cleaned = cleaned.replace(/<head>[\s\S]*?<\/head>/gi, '');
		cleaned = cleaned.replace(/<body[^>]*>/gi, '');
		cleaned = cleaned.replace(/<\/body>/gi, '');
		cleaned = cleaned.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
		cleaned = cleaned.replace(/<meta[^>]*>/gi, '');

		cleaned = cleaned.trim();

		if (!cleaned || cleaned.length < 10) {
			return '<p>Contract content will be generated here.</p>';
		}

		return cleaned;
	}

	/**
	 * Parse and validate BlockNote content from AI response
	 * @param {string} aiResponse - AI response containing BlockNote JSON
	 * @returns {Array} - Valid BlockNote blocks array
	 */
	parseBlockNoteContent(aiResponse) {
		try {
			let cleaned = aiResponse.trim();

			// Remove markdown code blocks if present
			cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');

			// Try to extract JSON array from response
			const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
			if (jsonMatch) {
				cleaned = jsonMatch[0];
			}

			const blocks = JSON.parse(cleaned);

			// Validate it's an array
			if (!Array.isArray(blocks)) {
				throw new Error('BlockNote content must be an array');
			}

			// Validate each block has required properties
			const validatedBlocks = blocks.map((block, index) => {
				if (!block.type) {
					throw new Error(`Block at index ${index} is missing 'type' property`);
				}

				// Ensure each block has at least type and content
				return {
					id: block.id || `block-${Date.now()}-${index}`,
					type: block.type,
					content: block.content || '',
					props: block.props || {}
				};
			});

			return validatedBlocks;
		} catch (error) {
			logger.error('Error parsing BlockNote content:', error);
			// Fallback to a simple paragraph block
			return [
				{
					id: `block-${Date.now()}`,
					type: 'paragraph',
					content: 'Contract content will be generated here.'
				}
			];
		}
	}
}

export default new ContractGenerationService();
