import contractService from '~/services/contractService';
import catchAsync from '~/utils/catchAsync';
import httpStatus from 'http-status';
import config from '~/config/config';
import SharedContract from '~/models/sharedContract';
import emailService from '~/services/emailService/index';
import logger from '~/config/logger';
import contractAnalysisService from '~/services/contractAnalysisService';
import ContractComment from '~/models/contractComment';
import contractPreviewService from '../services/contractPreviewService';
import aiService from '~/services/aiService';
import cacheService from '~/services/cacheService';
import ConversationAction from '~/models/conversationAction';
import notificationService from '~/services/notificationService';
import subscriptionService from '~/services/subscriptionService';
import contractGenerationService from '~/services/contractGenerationService';
import APIError from '~/utils/apiError';
import ContractConversation from '~/models/contractConversation';
// AI services use Google AI only

class ContractController {
	async createContract(req, res) {
		try {
			// Handle content as BlockNote blocks array or JSON string
			const contractData = { ...req.body };
			if (contractData.content) {
				if (typeof contractData.content === 'string') {
					// Try to parse as JSON (BlockNote format)
					try {
						contractData.content = JSON.parse(contractData.content);
					} catch (error) {
						// If parsing fails, convert HTML to BlockNote format (fallback)
						if (contractData.content.includes('<') && contractData.content.includes('>')) {
							contractData.content = this.convertHtmlToBlockNote(contractData.content);
						} else {
							// Plain text - convert to BlockNote paragraph
							contractData.content = [
								{
									id: `block-${Date.now()}`,
									type: 'paragraph',
									content: contractData.content
								}
							];
						}
					}
				}
				// Ensure content is an array (BlockNote format)
				if (!Array.isArray(contractData.content)) {
					contractData.content = [contractData.content];
				}
			}

			const contract = await contractService.createContract(contractData, req.user.id);

			// Initialize conversation history for this contract (async, don't wait)
			const contractObj = contract.toObject ? contract.toObject() : contract;
			ContractConversation.create({
				contractId: contract._id,
				userId: req.user.id,
				history: [],
				contractContext: {
					title: contractObj.title,
					type: contractObj.type,
					parties: contractObj.parties ? JSON.parse(JSON.stringify(contractObj.parties)) : [],
					jurisdiction: contractObj.jurisdiction,
					description: contractObj.description
				}
			}).catch((err) => {
				logger.error('Failed to initialize contract conversation:', err);
			});

			// Increment contract count (only for free tier users)
			// Subscription users have unlimited contracts
			if (req.subscriptionInfo && !req.subscriptionInfo.hasSubscription) {
				await subscriptionService.incrementContractCount(req.user.id);
			}

			res.status(201).json({ ...contractObj, lexiId: contractObj.lexiId });
		} catch (error) {
			res.status(400).json({ error: error.message });
		}
	}

	async getContract(req, res) {
		try {
			const contract = await contractService.getContract(req.params.contractId);
			const contractObj = contract.toObject();
			res.json({ ...contractObj, lexiId: contractObj.lexiId });
		} catch (error) {
			res.status(404).json({ error: error.message });
		}
	}

	async getUserContracts(req, res) {
		try {
			const result = await contractService.getUserContracts(req.user.id, req.query);
			const contractsWithLexiId = result.contracts.map((contract) => {
				const obj = contract.toObject();
				return { ...obj, lexiId: obj.lexiId };
			});
			res.json({
				...result,
				contracts: contractsWithLexiId
			});
		} catch (error) {
			res.status(400).json({ error: error.message });
		}
	}

	updateContract = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const { title, type, description, parties, jurisdiction, startDate, endDate, content, status } = req.body;

		// Parse the JSON stringified parties if provided
		let parsedParties = parties;
		if (parties && typeof parties === 'string') {
			try {
				parsedParties = JSON.parse(parties);
			} catch (error) {
				throw new Error('Invalid parties format');
			}
		}

		// Handle content as HTML string
		let processedContent = content;
		if (content && typeof content === 'string') {
			// Check if it's HTML content and clean it
			if (content.includes('<') && content.includes('>')) {
				processedContent = this.cleanHtmlResponse(content);
			}
		}

		// Get the existing contract
		const existingContract = await contractService.getContract(contractId);
		if (!existingContract) {
			throw new Error('Contract not found');
		}

		// Update the contract with provided data
		const updatedContract = await contractService.updateContract(
			contractId,
			{
				...(title && { title }),
				...(type && { type }),
				...(description && { description }),
				...(parsedParties && { parties: parsedParties }),
				...(jurisdiction && { jurisdiction }),
				...(startDate && { startDate }),
				...(endDate && { endDate }),
				...(processedContent && { content: processedContent }),
				...(status && { status })
			},
			req.user.id
		);

		// Note: Conversation history is updated separately via modifyContractWithPrompt

		// Invalidate relevant caches
		await cacheService.invalidateCache('contracts:*');
		await cacheService.invalidateCache(`user_contracts:${req.user.id}:*`);

		// Create notification for contract update
		try {
			await notificationService.createNotification({
				userId: req.user.id,
				type: 'contract_updated',
				title: 'Contract Updated',
				message: `You updated "${updatedContract.title || 'Untitled Contract'}"`,
				data: {
					contractId: updatedContract._id,
					contractTitle: updatedContract.title || 'Untitled Contract',
					updatedFields: Object.keys(req.body).filter((key) => req.body[key] !== undefined),
					updatedAt: new Date()
				},
				priority: 'low',
				actionUrl: `/contracts/${updatedContract._id}`,
				actionText: 'View Contract',
				metadata: {
					source: 'user',
					category: 'contract',
					relatedEntity: updatedContract._id,
					relatedEntityType: 'Contract',
					tags: ['update']
				}
			});
		} catch (notificationError) {
			// Log the error but don't fail the contract update
			console.error('Failed to create contract update notification:', notificationError);
		}

		res.status(httpStatus.OK).send({
			success: true,
			message: 'Contract updated successfully',
			data: updatedContract
		});
	});

	autoSaveContract = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const { content, lastModified, version, title, description, status } = req.body;

		// Lightweight update for auto-save - only update what's provided
		const updateData = {};

		if (content !== undefined) {
			// Process content as BlockNote blocks array
			if (typeof content === 'string') {
				// Try to parse as JSON (BlockNote format)
				try {
					updateData.content = JSON.parse(content);
					// Ensure it's an array
					if (!Array.isArray(updateData.content)) {
						updateData.content = [updateData.content];
					}
				} catch {
					// If parsing fails, convert HTML to BlockNote format (fallback)
					if (content.includes('<') && content.includes('>')) {
						updateData.content = this.convertHtmlToBlockNote(content);
					} else {
						// Plain text - convert to BlockNote paragraph
						updateData.content = [
							{
								id: `block-${Date.now()}`,
								type: 'paragraph',
								content: content
							}
						];
					}
				}
			} else {
				// Already an object/array - ensure it's an array
				updateData.content = Array.isArray(content) ? content : [content];
			}
		}

		if (title !== undefined) updateData.title = title;
		if (description !== undefined) updateData.description = description;
		if (status !== undefined) updateData.status = status;
		if (lastModified !== undefined) updateData.lastModified = lastModified;
		if (version !== undefined) updateData.version = version;

		// Add auto-save timestamp
		updateData.autoSavedAt = new Date();

		// Perform lightweight update
		const updatedContract = await contractService.updateContract(contractId, updateData, req.user.id);

		// Invalidate cache for this specific contract
		await cacheService.invalidateCache(`contract:${contractId}`);
		await cacheService.invalidateCache(`user_contracts:${req.user.id}:*`);

		res.status(httpStatus.OK).send({
			success: true,
			message: 'Contract auto-saved successfully',
			data: {
				contractId: updatedContract._id,
				lastModified: updatedContract.updatedAt,
				version: updatedContract.version || 1
			}
		});
	});

	async deleteContract(req, res) {
		try {
			// Get contract details before deletion for notification
			const contract = await contractService.getContract(req.params.contractId);

			// Delete contract conversation history (async, don't wait)
			ContractConversation.deleteOne({
				contractId: req.params.contractId,
				userId: req.user.id
			}).catch((err) => {
				logger.error('Failed to delete contract conversation:', err);
			});

			const result = await contractService.deleteContract(req.params.contractId, req.user.id);

			// Create notification for contract deletion
			try {
				await notificationService.createNotification({
					userId: req.user.id,
					type: 'contract_deleted',
					title: 'Contract Deleted',
					message: `You deleted "${contract?.title || 'Untitled Contract'}"`,
					data: {
						contractId: req.params.contractId,
						contractTitle: contract?.title || 'Untitled Contract',
						deletedAt: new Date()
					},
					priority: 'low',
					actionUrl: '/contracts',
					actionText: 'View Contracts',
					metadata: {
						source: 'user',
						category: 'contract',
						relatedEntity: req.params.contractId,
						relatedEntityType: 'Contract',
						tags: ['deletion']
					}
				});
			} catch (notificationError) {
				// Log the error but don't fail the contract deletion
				console.error('Failed to create contract deletion notification:', notificationError);
			}

			res.json(result);
		} catch (error) {
			res.status(400).json({ error: error.message });
		}
	}

	async generateContractSections(req, res) {
		try {
			const { contractType, parties } = req.body;
			const sections = await aiService.generateContractSections(contractType, parties);
			res.json({ sections });
		} catch (error) {
			if (error.message.includes('429') || error.message.includes('quota')) {
				res.status(503).json({
					error: 'AI service temporarily unavailable. Please try again later or contact support.',
					fallback: true
				});
			} else {
				res.status(400).json({ error: error.message });
			}
		}
	}

	async rewriteSection(req, res) {
		try {
			const { sectionContent, style } = req.body;
			const rewrittenContent = await aiService.rewriteSection(sectionContent, style);
			res.json({ content: rewrittenContent });
		} catch (error) {
			if (error.message.includes('429') || error.message.includes('quota')) {
				res.status(503).json({
					error: 'AI service temporarily unavailable. Please try again later or contact support.',
					fallback: true
				});
			} else {
				res.status(400).json({ error: error.message });
			}
		}
	}

	generateAIContract = catchAsync(async (req, res) => {
		const { prompt } = req.body;

		if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
			throw new APIError(
				'Please provide a detailed description of the contract you want to generate (minimum 10 characters)',
				httpStatus.BAD_REQUEST
			);
		}

		// Generate contract from simple text prompt
		const contractData = await contractGenerationService.generateContractFromPrompt(prompt.trim());

		// Content is already in BlockNote format (array of blocks)
		// Ensure it's properly formatted
		if (!Array.isArray(contractData.content)) {
			contractData.content = Array.isArray(contractData.content) ? contractData.content : [contractData.content];
		}

		// Create the contract
		const contract = await contractService.createContract(contractData, req.user.id);

		// Initialize conversation history with initial generation prompt
		const initialHistory = [
			{
				role: 'user',
				parts: prompt.trim(),
				timestamp: new Date()
			},
			{
				role: 'model',
				parts: JSON.stringify(contractData),
				timestamp: new Date()
			}
		];

		const contractObj = contract.toObject ? contract.toObject() : contract;
		ContractConversation.create({
			contractId: contract._id,
			userId: req.user.id,
			history: initialHistory,
			contractContext: {
				title: contractObj.title,
				type: contractObj.type,
				parties: contractObj.parties ? JSON.parse(JSON.stringify(contractObj.parties)) : [],
				jurisdiction: contractObj.jurisdiction,
				description: contractObj.description
			}
		}).catch((err) => {
			logger.error('Failed to initialize contract conversation:', err);
		});

		// Increment contract count (only for free tier users)
		// Subscription users have unlimited contracts
		if (req.subscriptionInfo && !req.subscriptionInfo.hasSubscription) {
			await subscriptionService.incrementContractCount(req.user.id);
		}

		res.status(httpStatus.CREATED).send({
			success: true,
			message: 'Contract generated successfully',
			data: {
				...contract.toObject(),
				lexiId: contract.lexiId
			}
		});
	});

	// Helper function to clean HTML response
	cleanHtmlResponse(htmlResponse) {
		// Remove markdown code blocks if present
		let cleaned = htmlResponse.replace(/```html\s*/gi, '').replace(/```\s*$/gi, '');

		// Remove complete HTML document structure
		cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
		cleaned = cleaned.replace(/<html[^>]*>/gi, '');
		cleaned = cleaned.replace(/<\/html>/gi, '');
		cleaned = cleaned.replace(/<head>[\s\S]*?<\/head>/gi, '');
		cleaned = cleaned.replace(/<body[^>]*>/gi, '');
		cleaned = cleaned.replace(/<\/body>/gi, '');

		// Remove any remaining document-level tags
		cleaned = cleaned.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
		cleaned = cleaned.replace(/<meta[^>]*>/gi, '');

		// Clean up extra whitespace
		cleaned = cleaned.trim();

		// If the result is empty or just whitespace, return a basic structure
		if (!cleaned || cleaned.length < 10) {
			return '<p>Contract content will be generated here.</p>';
		}

		return cleaned;
	}

	// Helper function to generate contract content using AI
	async generateContractContent({ title, type, description, parties, jurisdiction, startDate, endDate, content, aiPreferences }) {
		try {
			// Prepare the prompt for the AI
			const prompt = `Generate a legal contract with the following details:
Title: ${title}
Type: ${type}
Description: ${description}
Parties: ${JSON.stringify(parties)}
Jurisdiction: ${jurisdiction}
Start Date: ${startDate}
End Date: ${endDate}
Tone: ${aiPreferences.tone}
Language: ${aiPreferences.language}

Preferred Content Structure:
${JSON.stringify(content, null, 2)}

Required sections:
${aiPreferences.includeDefinitions ? '- Definitions: Clearly define all key terms used in the contract\n' : ''}
${aiPreferences.includeJurisdiction ? '- Jurisdiction: Specify the governing law and jurisdiction for disputes\n' : ''}
${aiPreferences.includeDisputeResolution ? '- Dispute Resolution: Include arbitration or mediation clauses as appropriate\n' : ''}
- Parties: Detailed information about all parties involved
- Term: Contract duration and renewal terms
- Obligations: Specific duties and responsibilities of each party
- Payment Terms: If applicable, include payment schedules and methods
- Confidentiality: If applicable, include confidentiality clauses
- Termination: Conditions and procedures for contract termination
- Miscellaneous: Include standard boilerplate clauses

IMPORTANT: Generate ONLY the contract content in simple HTML format. Do NOT include <!DOCTYPE html>, <html>, <head>, <body>, or any document structure tags. Only include the actual contract content with basic formatting like <h1>, <h2>, <p>, <strong>, <em> tags.`;

			// Use the new AI service with caching and fallback
			const aiResponse = await aiService.generateContent(prompt, {
				systemPrompt:
					'You are a legal contract expert. Generate professional contracts in simple HTML format with basic tags like <h1>, <h2>, <p>, <strong>, <em>. Generate ONLY the contract content, NOT a complete HTML document. Do not include <!DOCTYPE html>, <html>, <head>, <body> tags.',
				temperature: 0.7,
				maxTokens: 4000,
				cacheTTL: 3600 // Cache for 1 hour
			});

			// Clean the response to remove any document structure
			const cleanedResponse = this.cleanHtmlResponse(aiResponse);

			// Return the cleaned HTML content
			return cleanedResponse;
		} catch (error) {
			// Handle AI service errors with fallback
			console.warn('AI service failed, using fallback contract template:', error.message);

			// Return a basic contract template as fallback in HTML format
			const fallbackContent = `<h1>${title.toUpperCase()}</h1>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<p><em>This agreement is made between:</em></p>
${parties.map((party, index) => `<p>${index + 1}. <strong>${party.name}</strong> (${party.role}) - ${party.email}</p>`).join('')}
<h2>JURISDICTION</h2>
<p>This contract is governed by the laws of ${jurisdiction}.</p>
<h2>TERM</h2>
<p>This agreement shall commence on ${new Date(startDate).toLocaleDateString()} and shall continue until ${new Date(
				endDate
			).toLocaleDateString()}.</p>
<h2>OBLIGATIONS</h2>
<p>Each party shall fulfill their respective obligations as outlined in this agreement.</p>
<h2>PAYMENT TERMS</h2>
<p>Payment terms and schedules shall be as mutually agreed upon by the parties.</p>
<h2>CONFIDENTIALITY</h2>
<p>All parties agree to maintain the confidentiality of any proprietary information shared during the term of this agreement.</p>
<h2>TERMINATION</h2>
<p>This agreement may be terminated by either party with written notice as per the terms outlined herein.</p>
<h2>MISCELLANEOUS</h2>
<p>This agreement constitutes the entire understanding between the parties and supersedes all prior agreements.</p>`;

			return fallbackContent;
		}
	}

	generateShareableLink = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const { expiresIn, accessType, shareType, allowedEmails, regenerate } = req.body;

		// Verify contract exists and user has access
		const contract = await contractService.getContract(contractId);
		if (!contract) {
			throw new Error('Contract not found');
		}

		// Calculate expiration date
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + expiresIn);

		// Check if user already has a shareable link for this contract
		let sharedContract = await SharedContract.findOne({
			contractId,
			createdBy: req.user.id,
			isActive: true
		});

		if (sharedContract && !regenerate) {
			// Update existing shareable link
			sharedContract.accessType = accessType;
			sharedContract.shareType = shareType;
			sharedContract.expiresAt = expiresAt;
			sharedContract.allowedEmails = shareType === 'restricted' ? allowedEmails : [];
			await sharedContract.save();

			// Send notifications to newly added emails for restricted sharing
			if (shareType === 'restricted' && allowedEmails && allowedEmails.length > 0) {
				const newEmails = allowedEmails.filter((email) => !sharedContract.allowedEmails.includes(email));
				if (newEmails.length > 0) {
					await Promise.all(newEmails.map((email) => emailService.sendContractShareNotification(sharedContract, email)));
				}
			}
		} else {
			// If there's an existing link and regenerate is true, deactivate it
			if (sharedContract) {
				sharedContract.isActive = false;
				await sharedContract.save();
			}

			// Generate new share token
			const shareToken = SharedContract.generateToken();

			// Create new shared contract record
			sharedContract = new SharedContract({
				contractId,
				shareToken,
				createdBy: req.user.id,
				accessType,
				shareType,
				expiresAt,
				allowedEmails: shareType === 'restricted' ? allowedEmails : []
			});

			await sharedContract.save();

			// Send notifications to allowed emails for restricted sharing
			if (shareType === 'restricted' && allowedEmails && allowedEmails.length > 0) {
				await Promise.all(allowedEmails.map((email) => emailService.sendContractShareNotification(sharedContract, email)));
			}
		}

		// Generate shareable URL
		const shareableUrl = `${config.FRONTEND_URL}/contracts/shared/${sharedContract.shareToken}`;

		// Create notification for contract sharing
		try {
			await notificationService.createNotification({
				userId: req.user.id,
				type: 'contract_shared',
				title: 'Contract Shared',
				message: `You shared "${contract.title}" with ${
					shareType === 'restricted' ? allowedEmails?.length || 0 : 'public access'
				}`,
				data: {
					contractId: contract._id,
					contractTitle: contract.title,
					shareType: shareType,
					accessType: accessType,
					expiresAt: expiresAt,
					sharedWithCount: shareType === 'restricted' ? allowedEmails?.length || 0 : 'unlimited'
				},
				priority: 'medium',
				actionUrl: `/contracts/${contract._id}`,
				actionText: 'View Contract',
				metadata: {
					source: 'user',
					category: 'contract',
					relatedEntity: contract._id,
					relatedEntityType: 'Contract',
					tags: ['sharing']
				}
			});
		} catch (notificationError) {
			// Log the error but don't fail the sharing
			console.error('Failed to create contract sharing notification:', notificationError);
		}

		res.status(httpStatus.OK).send({
			success: true,
			data: {
				shareableUrl,
				expiresAt: sharedContract.expiresAt,
				accessType: sharedContract.accessType,
				shareType: sharedContract.shareType,
				allowedEmails: sharedContract.allowedEmails,
				isNew: !sharedContract.createdAt || new Date().getTime() - new Date(sharedContract.createdAt).getTime() < 1000, // Check if created within last second
				isRegenerated: regenerate
			}
		});
	});

	accessSharedContract = catchAsync(async (req, res) => {
		const { shareToken } = req.params;
		const userEmail = req.user.email; // Get email from authenticated user

		// Find shared contract
		const sharedContract = await SharedContract.findOne({ shareToken });
		if (!sharedContract) {
			throw new Error('Invalid or expired share link');
		}

		// Check if link is still valid
		if (!sharedContract.isValid()) {
			throw new Error('Share link has expired');
		}

		// Check email access
		if (!sharedContract.isEmailAllowed(userEmail)) {
			throw new Error('Access denied. Your email is not authorized to view this contract.');
		}

		// Get contract details
		const contract = await contractService.getContract(sharedContract.contractId);
		if (!contract) {
			throw new Error('Contract not found');
		}

		// Record access
		await sharedContract.recordAccess();

		// Send access notification
		try {
			await emailService.sendContractAccessNotification(sharedContract, userEmail);
		} catch (error) {
			logger.error('Failed to send access notification:', error);
		}

		// Create notification for contract owner about access
		try {
			await notificationService.createNotification({
				userId: sharedContract.createdBy,
				type: 'contract_accessed',
				title: 'Contract Accessed',
				message: `${req.user.firstName || req.user.userName || 'Someone'} accessed your shared contract "${contract.title}"`,
				data: {
					contractId: contract._id,
					contractTitle: contract.title,
					accessedBy: req.user.firstName || req.user.userName || 'User',
					accessedByEmail: userEmail,
					accessTime: new Date()
				},
				priority: 'low',
				actionUrl: `/contracts/${contract._id}`,
				actionText: 'View Contract',
				metadata: {
					source: 'system',
					category: 'contract',
					relatedEntity: contract._id,
					relatedEntityType: 'Contract',
					tags: ['access']
				}
			});
		} catch (notificationError) {
			// Log the error but don't fail the access
			console.error('Failed to create contract access notification:', notificationError);
		}

		// Return contract with access type
		res.status(httpStatus.OK).send({
			success: true,
			data: {
				contract,
				accessType: sharedContract.accessType,
				expiresAt: sharedContract.expiresAt
			}
		});
	});

	requestContractAccess = catchAsync(async (req, res) => {
		const { shareToken } = req.params;
		const { email, reason } = req.body;

		// Find shared contract
		const sharedContract = await SharedContract.findOne({ shareToken });
		if (!sharedContract) {
			throw new Error('Invalid or expired share link');
		}

		// Check if link is still valid
		if (!sharedContract.isValid()) {
			throw new Error('Share link has expired');
		}

		// Check if email is already allowed
		if (sharedContract.isEmailAllowed(email)) {
			throw new Error('You already have access to this contract');
		}

		// Add access request
		await sharedContract.addAccessRequest(email);

		// Get contract details for notification
		const contract = await contractService.getContract(sharedContract.contractId);
		const creator = await contract.populate({
			path: 'userId',
			model: 'User' // Explicitly specify the model name
		});

		// Send notification to contract creator
		try {
			await emailService.sendAccessRequestNotification(creator.userId.email, {
				contractTitle: contract.title,
				requestedBy: email,
				reason,
				shareToken
			});
		} catch (error) {
			logger.error('Failed to send access request notification:', error);
		}

		res.status(httpStatus.OK).send({
			success: true,
			message: 'Access request submitted successfully',
			data: {
				status: 'pending',
				requestedAt: new Date()
			}
		});
	});

	updateAccessRequest = catchAsync(async (req, res) => {
		const { shareToken, email } = req.params;
		const { status, responseNote } = req.body;

		// Find shared contract
		const sharedContract = await SharedContract.findOne({ shareToken });
		if (!sharedContract) {
			throw new Error('Invalid or expired share link');
		}

		// Update access request
		await sharedContract.updateAccessRequest(email, status, responseNote);

		// Send notification to requester
		try {
			await emailService.sendAccessRequestResponseNotification(email, {
				status,
				responseNote,
				shareToken
			});
		} catch (error) {
			logger.error('Failed to send access request response notification:', error);
		}

		res.status(httpStatus.OK).send({
			success: true,
			message: `Access request ${status} successfully`,
			data: {
				status,
				respondedAt: new Date()
			}
		});
	});

	analyzeContract = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const { analysisType, jurisdiction, industry, additionalContext } = req.body;

		// Get contract details
		const contract = await contractService.getContract(contractId);
		if (!contract) {
			throw new Error('Contract not found');
		}

		// Perform AI analysis
		const analysis = await contractAnalysisService.analyzeContract(contract, {
			analysisType,
			jurisdiction,
			industry,
			additionalContext
		});

		// Map findings to UI-friendly issues array
		const issues = [];
		if (analysis.risks) {
			analysis.risks.forEach((risk) => {
				issues.push({
					type: 'warning',
					title: risk.title || 'Risk',
					description: risk.description || risk,
					fixSuggestion: risk.fixSuggestion || undefined
				});
			});
		}
		if (analysis.compliance) {
			analysis.compliance.forEach((comp) => {
				issues.push({
					type: comp.severity === 'error' ? 'error' : 'warning',
					title: comp.title || 'Compliance Issue',
					description: comp.description || comp,
					fixSuggestion: comp.fixSuggestion || undefined
				});
			});
		}
		if (analysis.terms) {
			analysis.terms.forEach((term) => {
				if (term.status === 'good' || term.type === 'success') {
					issues.push({
						type: 'success',
						title: term.title || 'Well Defined Term',
						description: term.description || term
					});
				}
			});
		}

		// Example calculations (customize as needed)
		const riskScore = analysis.severity === 'High' ? 80 : analysis.severity === 'Medium' ? 40 : 0;
		const completeness = 100; // Or calculate based on required clauses found
		const issuesCount = issues.filter((i) => i.type !== 'success').length;

		res.status(httpStatus.OK).send({
			success: true,
			data: {
				contractId,
				contractName: contract.title,
				overview: {
					riskScore,
					riskLevel: analysis.severity || 'Low Risk',
					completeness,
					issuesCount,
					issuesSummary: issuesCount === 0 ? 'No issues found' : `${issuesCount} issues found`
				},
				aiRecommendations: analysis.recommendations || [],
				issues,
				parties: contract.parties?.map((p) => ({ name: p.name, role: p.role })) || []
			}
		});
	});

	saveAsTemplate = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const { templateName, description, category, isPublic } = req.body;

		// Get the original contract
		const contract = await contractService.getContract(contractId);
		if (!contract) {
			throw new Error('Contract not found');
		}

		// Create a new contract template
		const template = await contractService.createContract(
			{
				title: templateName,
				type: category,
				description: description || `Template based on ${contract.title}`,
				parties: contract.parties,
				jurisdiction: contract.jurisdiction,
				content: contract.content,
				isTemplate: true,
				isPublic,
				templateSource: contractId
			},
			req.user.id
		);

		res.status(httpStatus.CREATED).send({
			success: true,
			message: 'Contract saved as template successfully',
			data: template
		});
	});

	addContractComment = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const { content, context, parentCommentId } = req.body;

		// Verify contract exists and user has access
		const contract = await contractService.getContract(contractId);
		if (!contract) {
			throw new Error('Contract not found');
		}

		// If this is a reply, verify parent comment exists
		if (parentCommentId) {
			const parentComment = await ContractComment.findOne({
				_id: parentCommentId,
				contractId
			});
			if (!parentComment) {
				throw new Error('Parent comment not found');
			}
		}

		// Create the comment
		const comment = await ContractComment.create({
			contractId,
			userId: req.user.id,
			content,
			context,
			parentCommentId
		});

		// Populate user details
		await comment.populate('userId', 'name email');

		// Create notification for contract owner about new comment
		try {
			await notificationService.createNotification({
				userId: contract.userId,
				type: 'contract_comment',
				title: 'New Comment Added',
				message: `${req.user.firstName || req.user.userName || 'Someone'} added a comment to "${contract.title}"`,
				data: {
					contractId: contract._id,
					contractTitle: contract.title,
					commentId: comment._id,
					commentContent: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
					commentedBy: req.user.firstName || req.user.userName || 'User',
					context: context
				},
				priority: 'medium',
				actionUrl: `/contracts/${contract._id}`,
				actionText: 'View Comment',
				metadata: {
					source: 'user',
					category: 'contract',
					relatedEntity: contract._id,
					relatedEntityType: 'Contract',
					tags: ['comment']
				}
			});
		} catch (notificationError) {
			// Log the error but don't fail the comment creation
			console.error('Failed to create contract comment notification:', notificationError);
		}

		res.status(httpStatus.CREATED).send({
			success: true,
			data: comment
		});
	});

	getContractComments = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const { section, resolved, page = 1, limit = 20 } = req.query;

		// Verify contract exists and user has access
		const contract = await contractService.getContract(contractId);
		if (!contract) {
			throw new Error('Contract not found');
		}

		// Build query
		const query = { contractId };
		if (section) query['context.section'] = section;
		if (resolved !== undefined) query.isResolved = resolved === 'true';

		// Get comments with pagination
		const comments = await ContractComment.find(query)
			.populate('userId', 'name email')
			.populate('resolvedBy', 'name email')
			.sort({ createdAt: -1 })
			.skip((page - 1) * limit)
			.limit(parseInt(limit, 10));

		// Get total count for pagination
		const total = await ContractComment.countDocuments(query);

		res.status(httpStatus.OK).send({
			success: true,
			data: {
				comments,
				pagination: {
					total,
					page: parseInt(page, 10),
					limit: parseInt(limit, 10),
					pages: Math.ceil(total / limit)
				}
			}
		});
	});

	resolveContractComment = catchAsync(async (req, res) => {
		const { contractId, commentId } = req.params;

		// Verify contract exists and user has access
		const contract = await contractService.getContract(contractId);
		if (!contract) {
			throw new Error('Contract not found');
		}

		// Find and update the comment
		const comment = await ContractComment.findOneAndUpdate(
			{
				_id: commentId,
				contractId,
				isResolved: false
			},
			{
				isResolved: true,
				resolvedAt: new Date(),
				resolvedBy: req.user.id
			},
			{ new: true }
		);

		if (!comment) {
			throw new Error('Comment not found or already resolved');
		}

		// Populate user details
		await comment.populate('userId', 'name email');
		await comment.populate('resolvedBy', 'name email');

		res.status(httpStatus.OK).send({
			success: true,
			data: comment
		});
	});

	generateContractPreview = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const options = {
			width: parseInt(req.query.width) || 800,
			height: parseInt(req.query.height) || 1000,
			showWatermark: req.query.watermark !== 'false',
			theme: req.query.theme || 'default'
		};

		try {
			const image = await contractPreviewService.generatePreview(contractId, options);

			// Check if it's an SVG fallback (starts with <svg)
			if (image.toString().startsWith('<svg')) {
				res.setHeader('Content-Type', 'image/svg+xml');
			} else {
				res.setHeader('Content-Type', 'image/jpeg');
			}
			res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
			res.send(image);
		} catch (error) {
			console.error('Contract preview generation error:', error);

			// Return a fallback error image or JSON response
			if (req.query.format === 'json') {
				return res.status(500).json({
					success: false,
					error: 'Preview generation failed',
					message: error.message
				});
			}

			// For image requests, return a 500 error
			res.status(500).send('Preview generation failed');
		}
	});

	sendContractEmail = async (req, res) => {
		const { recipients, subject, message, format, expiresIn, accessType, shareType, allowedEmails, regenerate } = req.body;
		const { contractId } = req.params;

		let link,
			attachments = [];
		if (format === 'pdf') {
			const pdfBuffer = await contractService.generateContractPDF(contractId);
			attachments = [{ filename: 'contract.pdf', content: pdfBuffer }];
		} else if (format === 'editable_link' || format === 'view_link') {
			link = await contractService.generateShareableLink(contractId, req.user.id, {
				expiresIn,
				accessType,
				shareType,
				allowedEmails,
				regenerate
			});
		}

		const to = Array.isArray(recipients) ? recipients.join(',') : recipients;
		const text = message + (link ? `\n\nAccess the contract here: ${link && link.shareableUrl ? link.shareableUrl : link}` : '');

		await emailService.sendEmail(to, subject, text, attachments);

		res.json({ success: true });
	};

	addToFavorite = catchAsync(async (req, res) => {
		const contract = await contractService.addToFavorite(req.params.contractId, req.user.id);
		res.json({ ...contract.toObject(), lexiId: contract.lexiId });
	});

	removeFromFavorite = catchAsync(async (req, res) => {
		const contract = await contractService.removeFromFavorite(req.params.contractId, req.user.id);
		res.json({ ...contract.toObject(), lexiId: contract.lexiId });
	});

	checkAIHealth = catchAsync(async (req, res) => {
		const aiHealth = await aiService.healthCheck();
		const cacheHealth = await cacheService.healthCheck();

		res.json({
			ai: aiHealth,
			cache: cacheHealth, // In-memory cache is always available
			cacheType: 'in-memory',
			timestamp: new Date().toISOString()
		});
	});


	/**
	 * Check third-party APIs health
	 * Comprehensive health check for all external services
	 */
	checkThirdPartyAPIs = catchAsync(async (req, res) => {
		const thirdPartyHealthService = (await import('../services/thirdPartyHealthService.js')).default;
		const { services } = req.query; // Optional: ?services=googleAI,database

		// Parse services query parameter
		const servicesToCheck = services ? services.split(',').map((s) => s.trim()) : null;

		const healthResults = await thirdPartyHealthService.checkAll({
			services: servicesToCheck
		});

		// Determine HTTP status based on overall health
		let httpStatusCode = httpStatus.OK;
		if (healthResults.overall === 'unhealthy') {
			httpStatusCode = httpStatus.SERVICE_UNAVAILABLE;
		} else if (healthResults.overall === 'degraded') {
			httpStatusCode = httpStatus.OK; // Still OK, but some services not configured
		}

		res.status(httpStatusCode).send({
			success: healthResults.overall !== 'unhealthy',
			data: healthResults
		});
	});

	checkPreviewHealth = catchAsync(async (req, res) => {
		console.log('Preview health check called from IP:', req.ip, 'at', new Date().toISOString());
		try {
			const puppeteer = await import('puppeteer');
			const isProduction = process.env.NODE_ENV === 'production';

			const launchOptions = {
				headless: 'new',
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-accelerated-2d-canvas',
					'--no-first-run',
					'--no-zygote',
					'--single-process',
					'--disable-gpu'
				]
			};

			if (isProduction) {
				// Try to find Chrome in common locations first
				const fs = await import('fs');
				const chromePaths = [
					'/usr/bin/google-chrome-stable',
					'/usr/bin/google-chrome',
					'/usr/bin/chromium-browser',
					'/usr/bin/chromium',
					'/opt/render/.cache/puppeteer/chrome/linux-137.0.7151.55/chrome-linux64/chrome'
				];

				let executablePath;
				for (const path of chromePaths) {
					if (fs.existsSync(path)) {
						executablePath = path;
						break;
					}
				}

				if (executablePath) {
					launchOptions.executablePath = executablePath;
				}
			}

			// Try launching with the configured options
			let browser;
			let usedPath = 'default';
			try {
				browser = await puppeteer.default.launch(launchOptions);
				usedPath = launchOptions.executablePath || 'bundled-chromium';
			} catch (firstError) {
				console.log('First launch attempt failed, trying without executablePath...');
				// If that fails, try without specifying executablePath (use bundled Chromium)
				delete launchOptions.executablePath;
				browser = await puppeteer.default.launch(launchOptions);
				usedPath = 'bundled-chromium-fallback';
			}

			await browser.close();
			res.json({
				success: true,
				message: 'Puppeteer is working correctly',
				environment: process.env.NODE_ENV,
				chromePath: usedPath,
				timestamp: new Date().toISOString()
			});
		} catch (error) {
			res.status(500).json({
				success: false,
				error: 'Puppeteer health check failed',
				message: error.message,
				environment: process.env.NODE_ENV,
				timestamp: new Date().toISOString()
			});
		}
	});

	// Cache health check endpoint
	getCacheHealth = catchAsync(async (req, res) => {
		const cacheHealth = await cacheService.healthCheck();
		const cacheStatus = cacheHealth ? 'healthy' : 'unhealthy';
		const cacheSize = await cacheService.getCacheSize();

		res.status(httpStatus.OK).send({
			success: true,
			data: {
				cache: cacheStatus,
				cacheType: 'in-memory',
				entries: cacheSize,
				timestamp: new Date().toISOString()
			}
		});
	});

	// Helper function to convert HTML to BlockNote format
	convertHtmlToBlockNote(htmlContent) {
		try {
			const blocks = [];
			const cleanHtml = htmlContent.trim();

			// Split HTML by block-level elements
			const blockElements = cleanHtml.split(/(?=<(h[1-6]|p|ul|ol|blockquote|div)[^>]*>)/gi);

			blockElements.forEach((element, index) => {
				const trimmed = element.trim();
				if (!trimmed) return;

				// Heading blocks
				if (trimmed.match(/^<h1[^>]*>/i)) {
					const text = trimmed.replace(/<[^>]*>/g, '').trim();
					if (text) {
						blocks.push({
							id: `block-${Date.now()}-${index}`,
							type: 'heading',
							props: { level: 1 },
							content: text
						});
					}
				} else if (trimmed.match(/^<h2[^>]*>/i)) {
					const text = trimmed.replace(/<[^>]*>/g, '').trim();
					if (text) {
						blocks.push({
							id: `block-${Date.now()}-${index}`,
							type: 'heading',
							props: { level: 2 },
							content: text
						});
					}
				} else if (trimmed.match(/^<h3[^>]*>/i)) {
					const text = trimmed.replace(/<[^>]*>/g, '').trim();
					if (text) {
						blocks.push({
							id: `block-${Date.now()}-${index}`,
							type: 'heading',
							props: { level: 3 },
							content: text
						});
					}
				}
				// Quote blocks
				else if (trimmed.match(/^<blockquote[^>]*>/i) || trimmed.match(/^<q[^>]*>/i)) {
					const text = trimmed.replace(/<[^>]*>/g, '').trim();
					if (text) {
						blocks.push({
							id: `block-${Date.now()}-${index}`,
							type: 'quote',
							content: text
						});
					}
				}
				// List items
				else if (trimmed.match(/^<li[^>]*>/i)) {
					const text = trimmed.replace(/<[^>]*>/g, '').trim();
					if (text) {
						// Determine if it's in a ul or ol (simplified - assumes ul)
						blocks.push({
							id: `block-${Date.now()}-${index}`,
							type: 'bulletListItem',
							content: text
						});
					}
				}
				// Paragraphs
				else if (trimmed.match(/^<p[^>]*>/i)) {
					const text = trimmed
						.replace(/<[^>]*>/g, ' ')
						.replace(/\s+/g, ' ')
						.trim();
					if (text) {
						blocks.push({
							id: `block-${Date.now()}-${index}`,
							type: 'paragraph',
							content: text
						});
					}
				}
				// Default to paragraph for any other content
				else {
					const text = trimmed
						.replace(/<[^>]*>/g, ' ')
						.replace(/\s+/g, ' ')
						.trim();
					if (text && text.length > 0) {
						blocks.push({
							id: `block-${Date.now()}-${index}`,
							type: 'paragraph',
							content: text
						});
					}
				}
			});

			// If no blocks were created, create a default paragraph
			if (blocks.length === 0) {
				const plainText = cleanHtml
					.replace(/<[^>]*>/g, ' ')
					.replace(/\s+/g, ' ')
					.trim();
				blocks.push({
					id: `block-${Date.now()}`,
					type: 'paragraph',
					content: plainText || 'Contract content'
				});
			}

			return blocks;
		} catch (error) {
			logger.error('Error converting HTML to BlockNote:', error);
			// Fallback to simple paragraph block
			return [
				{
					id: `block-${Date.now()}`,
					type: 'paragraph',
					content: htmlContent.replace(/<[^>]*>/g, ' ').trim() || 'Contract content'
				}
			];
		}
	}

	// Legacy function - kept for backward compatibility but redirects to BlockNote
	convertHtmlToTipTapJson(htmlContent) {
		try {
			// Simple HTML to TipTap JSON conversion
			// This is a basic implementation - you might want to use a proper HTML parser for complex cases

			// Remove extra whitespace and normalize
			const cleanHtml = htmlContent.trim();

			// Convert common HTML tags to TipTap format
			let jsonContent = cleanHtml
				// Convert headings
				.replace(/<h1[^>]*>(.*?)<\/h1>/gi, (match, content) => {
					return `{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"${content.trim()}"}]}`;
				})
				.replace(/<h2[^>]*>(.*?)<\/h2>/gi, (match, content) => {
					return `{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"${content.trim()}"}]}`;
				})
				.replace(/<h3[^>]*>(.*?)<\/h3>/gi, (match, content) => {
					return `{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"${content.trim()}"}]}`;
				})
				// Convert paragraphs
				.replace(/<p[^>]*>(.*?)<\/p>/gi, (match, content) => {
					// Handle nested formatting
					const formattedContent = this.processInlineFormatting(content);
					return `{"type":"paragraph","content":${formattedContent}}`;
				})
				// Convert line breaks
				.replace(/<br\s*\/?>/gi, '{"type":"hardBreak"}')
				// Convert strong/bold
				.replace(/<strong[^>]*>(.*?)<\/strong>/gi, (match, content) => {
					return `{"type":"text","marks":[{"type":"bold"}],"text":"${content.trim()}"}`;
				})
				// Convert em/italic
				.replace(/<em[^>]*>(.*?)<\/em>/gi, (match, content) => {
					return `{"type":"text","marks":[{"type":"italic"}],"text":"${content.trim()}"}`;
				})
				// Convert mark/highlight
				.replace(/<mark[^>]*>(.*?)<\/mark>/gi, (match, content) => {
					return `{"type":"text","marks":[{"type":"highlight"}],"text":"${content.trim()}"}`;
				})
				// Convert spans with styles
				.replace(/<span[^>]*style="[^"]*color:\s*([^;"]+)[^"]*"[^>]*>(.*?)<\/span>/gi, (match, color, content) => {
					return `{"type":"text","marks":[{"type":"textStyle","attrs":{"color":"${color.trim()}"}}],"text":"${content.trim()}"}`;
				});

			// Split into blocks and create proper TipTap structure
			const blocks = jsonContent.split(/(?={"type":)/).filter((block) => block.trim());

			const content = blocks.map((block) => {
				try {
					return JSON.parse(block.trim());
				} catch (error) {
					// If parsing fails, treat as plain text
					return {
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: block.trim()
							}
						]
					};
				}
			});

			return {
				type: 'doc',
				content: content
			};
		} catch (error) {
			// Fallback to simple text if conversion fails
			return {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: htmlContent.replace(/<[^>]*>/g, '') // Strip HTML tags
							}
						]
					}
				]
			};
		}
	}

	// Helper function to process inline formatting
	processInlineFormatting(content) {
		// Handle nested formatting like <strong><em>text</em></strong>
		let processedContent = content;

		// Process bold
		processedContent = processedContent.replace(/<strong[^>]*>(.*?)<\/strong>/gi, (match, text) => {
			return `{"type":"text","marks":[{"type":"bold"}],"text":"${text.trim()}"}`;
		});

		// Process italic
		processedContent = processedContent.replace(/<em[^>]*>(.*?)<\/em>/gi, (match, text) => {
			return `{"type":"text","marks":[{"type":"italic"}],"text":"${text.trim()}"}`;
		});

		// Process mark/highlight
		processedContent = processedContent.replace(/<mark[^>]*>(.*?)<\/mark>/gi, (match, text) => {
			return `{"type":"text","marks":[{"type":"highlight"}],"text":"${text.trim()}"}`;
		});

		// If no formatting found, return as plain text
		if (!processedContent.includes('"type":"text"')) {
			return `[{"type":"text","text":"${processedContent.trim()}"}]`;
		}

		return `[${processedContent}]`;
	}

	getConversationActions = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const actions = await ConversationAction.find({ contractId })
			.populate('userId', 'firstName lastName email')
			.sort({ createdAt: -1 });
		res.status(200).json({ success: true, actions });
	});

	downloadContractPDF = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const userId = req.user.id;

		try {
			const result = await contractService.downloadContractPDF(contractId, userId);

			// Set response headers for PDF download
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
			res.setHeader('Content-Length', result.pdfBuffer.length);

			// Send the PDF buffer
			res.send(result.pdfBuffer);
		} catch (error) {
			res.status(404).json({ error: error.message });
		}
	});

	/**
	 * Modify an existing contract using AI prompt (iterative editing like ChatGPT Canvas)
	 * Uses conversation history for context-aware modifications
	 */
	modifyContractWithPrompt = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const { prompt, selectedBlocks } = req.body; // selectedBlocks for selective editing
		const userId = req.user.id;

		if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
			throw new APIError(
				'Please provide a clear instruction for how to modify the contract (minimum 5 characters)',
				httpStatus.BAD_REQUEST
			);
		}

		// Get the existing contract
		const contract = await contractService.getContract(contractId);
		if (!contract) {
			throw new APIError('Contract not found', httpStatus.NOT_FOUND);
		}

		// Verify ownership
		if (contract.userId.toString() !== userId.toString()) {
			throw new APIError('Unauthorized to modify this contract', httpStatus.FORBIDDEN);
		}

		// Get or create conversation history for this contract
		let conversation = await ContractConversation.findOne({ contractId, userId });
		if (!conversation) {
			// Initialize conversation if it doesn't exist
			const contractObj = contract.toObject ? contract.toObject() : contract;
			conversation = await ContractConversation.create({
				contractId,
				userId,
				history: [],
				contractContext: {
					title: contractObj.title,
					type: contractObj.type,
					parties: contractObj.parties ? JSON.parse(JSON.stringify(contractObj.parties)) : [],
					jurisdiction: contractObj.jurisdiction,
					description: contractObj.description
				}
			});
		}

		// Import blockNoteConverter for text conversion
		const { convertBlockNoteToText } = await import('../utils/blockNoteConverter.js');

		// Convert current contract content to text for context
		const currentContractText = convertBlockNoteToText(contract.content);

		// Build modification prompt
		let modificationPrompt;
		if (selectedBlocks && Array.isArray(selectedBlocks) && selectedBlocks.length > 0) {
			// Selective editing: only modify selected blocks
			const selectedText = convertBlockNoteToText(selectedBlocks);
			modificationPrompt = `You are modifying a legal contract. The user has selected specific parts to modify.

Contract Context:
Title: ${contract.title}
Type: ${contract.type}
Jurisdiction: ${contract.jurisdiction}
Parties: ${contract.parties.map((p) => `${p.name} (${p.role})`).join(', ')}

Selected text to modify:
${selectedText}

Full contract context (for understanding only, DO NOT modify):
${currentContractText.substring(0, 2000)}...

User's modification request: "${prompt.trim()}"

IMPORTANT: Return ONLY the modified version of the selected text in BlockNote JSON format (array of blocks). Do not modify or return the entire contract, only the selected portion.`;
		} else {
			// Full contract modification
			modificationPrompt = `You are modifying an existing legal contract. Here is the current contract:

Title: ${contract.title}
Type: ${contract.type}
Description: ${contract.description}
Jurisdiction: ${contract.jurisdiction}
Parties: ${contract.parties.map((p) => `${p.name} (${p.role})`).join(', ')}

Current Contract Content:
${currentContractText}

User's modification request: "${prompt.trim()}"

IMPORTANT INSTRUCTIONS:
1. Modify the contract according to the user's request while maintaining legal soundness
2. Preserve the contract structure and important clauses unless explicitly asked to change them
3. Return the ENTIRE modified contract in BlockNote JSON format (array of blocks)
4. If the user wants to add something, integrate it naturally into the existing structure
5. If the user wants to remove something, remove it but maintain document coherence
6. If the user wants to change tone/style, apply it throughout while keeping legal meaning
7. Return ONLY a valid JSON array of BlockNote blocks, no additional text or markdown

BlockNote format structure:
- Each block is an object with "type" and "content" properties
- Supported block types: "paragraph", "heading", "quote", "bulletListItem", "numberedListItem", "checkListItem"
- Headings can have props: { "level": 1-3 }
- Content can be a string (for simple text) or an array of inline content objects
- Inline content objects have: { "type": "text", "text": "...", "styles": { "bold": true, "italic": true } }`;
		}

		// Use AI service with conversation history
		const result = await aiService.generateWithChatHistory(modificationPrompt, conversation.history, {
			systemPrompt:
				'You are a legal contract expert. Modify existing contracts based on user instructions while maintaining legal soundness. Return ONLY a valid JSON array of BlockNote blocks, no additional text.',
			temperature: 0.7
		});

		// Parse the modified content
		const modifiedBlocks = contractGenerationService.parseBlockNoteContent(result.text);

		// Ensure modifiedBlocks is an array
		if (!Array.isArray(modifiedBlocks)) {
			throw new APIError('Failed to parse modified contract content', httpStatus.INTERNAL_SERVER_ERROR);
		}

		// Merge modified blocks if selective editing
		let finalContent;
		if (selectedBlocks && Array.isArray(selectedBlocks) && selectedBlocks.length > 0) {
			// Merge: replace selected blocks with modified blocks
			const blockMap = new Map(modifiedBlocks.map((b) => [b.id || b.content?.substring(0, 50), b]));
			finalContent = contract.content.map((block) => {
				// Try to match selected blocks with modified blocks
				const selectedBlock = selectedBlocks.find((sb) => sb.id === block.id);
				if (selectedBlock) {
					const modified = modifiedBlocks.find((mb) => mb.id === block.id || mb.content === block.content);
					return modified || block;
				}
				return block;
			});
		} else {
			// Full contract replacement
			finalContent = modifiedBlocks;
		}

		// Update the contract with modified content
		const updatedContract = await contractService.updateContract(
			contractId,
			{
				content: finalContent
			},
			userId
		);

		// Update conversation history
		await conversation.addMessage('user', prompt.trim());
		await conversation.addMessage('model', result.text);

		// Invalidate cache
		await cacheService.invalidateCache(`contract:${contractId}`);
		await cacheService.invalidateCache(`user_contracts:${userId}:*`);

		res.status(httpStatus.OK).send({
			success: true,
			message: 'Contract modified successfully',
			data: {
				...updatedContract.toObject(),
				lexiId: updatedContract.lexiId,
				conversationHistory: result.history
			}
		});
	});

	/**
	 * Get conversation history for a contract
	 * GET /api/v1/contracts/:contractId/conversation
	 */
	getContractConversation = catchAsync(async (req, res) => {
		const { contractId } = req.params;
		const userId = req.user.id;

		// Get the contract to verify ownership
		const contract = await contractService.getContract(contractId);
		if (!contract) {
			throw new APIError('Contract not found', httpStatus.NOT_FOUND);
		}

		// Verify ownership
		if (contract.userId.toString() !== userId.toString()) {
			throw new APIError('Unauthorized to view this contract conversation', httpStatus.FORBIDDEN);
		}

		// Get conversation history
		const conversation = await ContractConversation.findOne({ contractId, userId });

		if (!conversation) {
			// Return empty history if no conversation exists yet
			return res.status(httpStatus.OK).send({
				success: true,
				data: {
					contractId,
					history: [],
					contractContext: {
						title: contract.title,
						type: contract.type,
						parties: contract.parties,
						jurisdiction: contract.jurisdiction,
						description: contract.description
					}
				}
			});
		}

		res.status(httpStatus.OK).send({
			success: true,
			data: {
				contractId: conversation.contractId,
				history: conversation.history,
				contractContext: conversation.contractContext,
				createdAt: conversation.createdAt,
				updatedAt: conversation.updatedAt
			}
		});
	});
}

export default new ContractController();
