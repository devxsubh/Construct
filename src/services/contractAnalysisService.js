import config from '~/config/config';
import logger from '~/config/logger';
import cacheService from './cacheService';
import aiService from './aiService';

class ContractAnalysisService {
	constructor() {
		// Using Google AI only
	}

	async analyzeContract(contract, options = {}) {
		const { analysisType = 'all', jurisdiction, industry, additionalContext } = options;

		try {
			// Prepare the contract content for analysis
			const contractContent = this.prepareContractContent(contract);

			// Generate analysis prompt based on type
			const prompt = this.generateAnalysisPrompt(contractContent, {
				analysisType,
				jurisdiction,
				industry,
				additionalContext
			});

			// Get AI analysis
			const analysis = await this.getAIAnalysis(prompt, contract.id);

			// Structure the response
			return this.structureAnalysisResponse(analysis, analysisType);
		} catch (error) {
			logger.error('Contract analysis failed:', error, error.stack);
			throw new Error('Failed to analyze contract: ' + error.message);
		}
	}

	prepareContractContent(contract) {
		// If content is a string (HTML), just include it as-is
		return {
			title: contract.title,
			type: contract.type,
			description: contract.description,
			parties: contract.parties,
			jurisdiction: contract.jurisdiction,
			startDate: contract.startDate,
			endDate: contract.endDate,
			content: contract.content // HTML string
		};
	}

	generateAnalysisPrompt(contractContent, options) {
		const { analysisType, jurisdiction, industry, additionalContext } = options;

		let analysisInstructions = '';
		switch (analysisType) {
			case 'risk':
				analysisInstructions = `
				1. Identify potential legal and business risks
				2. Assess risk severity (High/Medium/Low)
				3. Suggest risk mitigation strategies
				4. Highlight ambiguous or unclear terms`;
				break;
			case 'compliance':
				analysisInstructions = `
				1. Check compliance with relevant laws and regulations
				2. Identify missing required clauses
				3. Flag potential compliance issues
				4. Suggest compliance improvements`;
				break;
			case 'terms':
				analysisInstructions = `
				1. Extract and summarize key terms
				2. Identify unusual or onerous terms
				3. Compare terms with industry standards
				4. Highlight important deadlines and obligations`;
				break;
			default:
				analysisInstructions = `
				1. Comprehensive risk assessment
				2. Compliance analysis
				3. Key terms analysis
				4. Industry-specific considerations
				5. Recommendations for improvement`;
		}

		return `Analyze the following contract and provide a detailed analysis:

Contract Details:
Title: ${contractContent.title}
Type: ${contractContent.type}
Description: ${contractContent.description}
Jurisdiction: ${jurisdiction || contractContent.jurisdiction}
Industry: ${industry || 'Not specified'}

Parties:
${JSON.stringify(contractContent.parties, null, 2)}

Contract Content (HTML):
${contractContent.content}

Additional Context:
${additionalContext || 'None provided'}

Please provide a detailed analysis covering:
${analysisInstructions}

Format the response as a structured JSON object with the following sections:
{
  "summary": "Brief overview of the analysis",
  "findings": {
    "risks": [],
    "compliance": [],
    "terms": []
  },
  "recommendations": [],
  "severity": "Overall risk level (High/Medium/Low)",
  "confidence": "Analysis confidence level (High/Medium/Low)"
}`;
	}

	// Utility to clean AI JSON response
	cleanAIJsonResponse(aiResponse) {
		// Remove code block markers (```json ... ```)
		return aiResponse.replace(/```json|```/gi, '').trim();
	}

	async getAIAnalysis(prompt, contractId) {
		// Use Google AI only
		let aiResponse;
		try {
			aiResponse = await aiService.generateWithGoogleAI(prompt, {
				systemPrompt:
					'You are an expert contract analyst with deep knowledge of legal compliance, risk assessment, and contract law. Provide detailed, accurate, and actionable analysis.',
				temperature: 0.3,
				maxTokens: 4000
			});
		} catch (err) {
			logger.error('AI provider failed for contract analysis:', err);
			throw new Error('AI provider failed for contract analysis');
		}
		try {
			const cleaned = this.cleanAIJsonResponse(aiResponse);
			return JSON.parse(cleaned);
		} catch (error) {
			logger.error('Failed to parse AI response:', error);
			throw new Error('Failed to parse analysis results');
		}
	}

	structureAnalysisResponse(analysis, analysisType) {
		// Filter sections based on analysis type
		const filteredAnalysis = {
			summary: analysis.summary,
			severity: analysis.severity,
			confidence: analysis.confidence,
			recommendations: analysis.recommendations
		};

		if (analysisType === 'all' || analysisType === 'risk') {
			filteredAnalysis.risks = analysis.findings.risks;
		}
		if (analysisType === 'all' || analysisType === 'compliance') {
			filteredAnalysis.compliance = analysis.findings.compliance;
		}
		if (analysisType === 'all' || analysisType === 'terms') {
			filteredAnalysis.terms = analysis.findings.terms;
		}

		return filteredAnalysis;
	}

	async compareMarketStandards(contractId, options) {
		const { industry, jurisdiction, contractType } = options;

		try {
			// Prepare the contract content for analysis
			const contractContent = this.prepareContractContent(contractId);

			// Generate market comparison prompt
			const prompt = `Analyze the following contract and compare it with market standards:
	
			Contract Details:
			Type: ${contractType}
			Industry: ${industry}
			Jurisdiction: ${jurisdiction}
	
			Contract Content:
			${JSON.stringify(contractContent, null, 2)}
	
			Please provide:
			1. Term-by-term comparison with market standards
			2. Identification of terms that deviate from market norms
			3. Suggestions for aligning terms with market standards
			4. Industry-specific considerations
			5. Jurisdiction-specific market practices`;

			// Get AI analysis
			const analysis = await this.getAIAnalysis(prompt, contractId);

			// Structure the response
			return {
				marketComparison: analysis,
				metadata: {
					industry,
					jurisdiction,
					contractType,
					analysisDate: new Date()
				}
			};
		} catch (error) {
			logger.error('Market comparison analysis failed:', error);
			throw new Error('Failed to compare contract with market standards');
		}
	}

	/**
	 * AI-powered clause action for a selected contract part
	 * @param {string} contractId
	 * @param {string} action - One of: explain, simplify, improve, verify, risk, suggest, custom, other
	 * @param {string} text - The selected clause/paragraph
	 * @param {string} [customPrompt] - Optional custom prompt to override the default
	 * @returns {Promise<string>} AI result
	 */
	async aiClauseAction(contractId, action, text, customPrompt) {
		if (!text || typeof text !== 'string' || text.length < 5) {
			throw new Error('A valid clause or paragraph text is required.');
		}
		const actionPrompts = {
			explain: 'Explain the following contract clause in plain English:',
			simplify: `Rewrite the following contract clause in simpler language.\nReturn your answer as a JSON object with two fields:\n- "options": an array of 2-3 simplified versions of the clause (each as a string)\n- "explanation": a string explaining the key changes made and why.\n\nClause:`,
			improve: `Improve the wording of the following contract clause for clarity and professionalism.\nReturn your answer as a JSON object with two fields:\n- "options": an array of 2-3 improved versions of the clause (each as a string)\n- "explanation": a string explaining the key changes made and why.\n\nClause:`,
			verify:
				'Check if the following contract clause based on the India Jurisdiction complies with Indian law. Point out any issues:',
			risk: 'Identify any legal or business risks in the following contract clause:',
			suggest: 'Suggest any additions or improvements to the following contract clause:'
		};
		const isCustom = action === 'custom' || action === 'other';
		if ((isCustom && !customPrompt) || (!actionPrompts[action] && !isCustom)) {
			throw new Error(
				'Invalid action. Supported actions: explain, simplify, improve, verify, risk, suggest, custom, other. For custom/other, provide a customPrompt.'
			);
		}
		const prompt = `${isCustom ? customPrompt : actionPrompts[action]}

${text}`;
		// Use Google AI only
		let aiResponse;
		try {
			aiResponse = await aiService.generateWithGoogleAI(prompt, {
				systemPrompt: 'You are a legal contract expert.',
				temperature: 0.5,
				maxTokens: 1000
			});
		} catch (err) {
			throw new Error('AI provider failed for clause action: ' + err.message);
		}
		// For simplify, try to parse as JSON and return structured result
		if ((action === 'simplify' || action === 'improve') && aiResponse) {
			try {
				const cleaned = this.cleanAIJsonResponse(aiResponse);
				return JSON.parse(cleaned);
			} catch (err) {
				// fallback to raw string
				return aiResponse;
			}
		}
		return aiResponse;
	}
}

export default new ContractAnalysisService();
