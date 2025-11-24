import Joi from 'joi';
import { mongoId } from './customValidation';

const createContract = {
	body: Joi.object().keys({
		title: Joi.string().min(3).max(200).required(),
		type: Joi.string().min(2).max(100).required(),
		contractType: Joi.string().custom(mongoId).optional(),
		description: Joi.string().min(10).max(2000).required(),
		parties: Joi.array()
			.items(
				Joi.object({
					name: Joi.string().required(),
					role: Joi.string().required(),
					email: Joi.string().email().required(),
					aadhaar: Joi.string()
						.pattern(/^[0-9]{12}$/)
						.optional(),
					dsc: Joi.object({
						serialNumber: Joi.string(),
						validFrom: Joi.date().iso(),
						validTo: Joi.date().iso()
					}).optional()
				})
			)
			.required(),
		jurisdiction: Joi.string().min(2).max(100).required(),
		startDate: Joi.date().iso().required(),
		endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
		content: Joi.object({
			clauses: Joi.array()
				.items(
					Joi.object({
						title: Joi.string().required(),
						content: Joi.string().required()
					})
				)
				.required(),
			appearance: Joi.object({
				font: Joi.string(),
				spacing: Joi.number(),
				margins: Joi.object()
			}).required(),
			aiResponses: Joi.array()
				.items(
					Joi.object({
						query: Joi.string().required(),
						response: Joi.string().required(),
						timestamp: Joi.date().iso().required()
					})
				)
				.required(),
			conversationSummary: Joi.string().required()
		}).required()
	})
};

const getContract = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId)
	})
};

const downloadContractPDF = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	})
};

const modifyContractWithPrompt = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	}),
	body: Joi.object().keys({
		prompt: Joi.string().min(5).max(2000).required().messages({
			'string.min': 'Please provide a clear instruction (at least 5 characters)',
			'string.max': 'Instruction is too long (maximum 2000 characters)',
			'any.required': 'Please provide an instruction for how to modify the contract'
		}),
		selectedBlocks: Joi.array()
			.items(
				Joi.object({
					id: Joi.string().optional(),
					type: Joi.string().required(),
					content: Joi.alternatives().try(Joi.string(), Joi.array()).required(),
					props: Joi.object().optional()
				})
			)
			.optional()
			.description('Selected BlockNote blocks for selective editing (optional)')
	})
};

const getUserContracts = {
	query: Joi.object().keys({
		page: Joi.number().integer(),
		limit: Joi.number().integer(),
		sortBy: Joi.string(),
		sortOrder: Joi.string().valid('asc', 'desc')
	})
};

const updateContract = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId)
	}),
	body: Joi.object()
		.keys({
			title: Joi.string().min(3).max(200).optional(),
			type: Joi.string().min(2).max(100).optional(),
			contractType: Joi.string().custom(mongoId).optional(),
			description: Joi.string().min(10).max(2000).optional(),
			parties: Joi.array()
				.items(
					Joi.object({
						name: Joi.string().required(),
						role: Joi.string().required(),
						email: Joi.string().email().required(),
						aadhaar: Joi.string()
							.pattern(/^[0-9]{12}$/)
							.optional(),
						dsc: Joi.object({
							serialNumber: Joi.string(),
							validFrom: Joi.date().iso(),
							validTo: Joi.date().iso()
						}).optional()
					})
				)
				.optional(),
			jurisdiction: Joi.string().min(2).max(100).optional(),
			startDate: Joi.date().iso().optional(),
			endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
			content: Joi.string().optional(),
			status: Joi.string().valid('draft', 'review', 'final').optional()
		})
		.min(1)
};

// Auto-save validation - lightweight for frequent updates
const autoSaveContract = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	}),
	body: Joi.object()
		.keys({
			content: Joi.string().optional(),
			lastModified: Joi.date().iso().optional(),
			version: Joi.number().integer().min(1).optional(),
			// Allow partial updates for specific fields
			title: Joi.string().min(3).max(200).optional(),
			description: Joi.string().min(10).max(2000).optional(),
			status: Joi.string().valid('draft', 'review', 'final').optional()
		})
		.min(1)
};

const deleteContract = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId)
	})
};

const generateSections = {
	body: Joi.object().keys({
		contractType: Joi.string().required(),
		parties: Joi.array()
			.items(
				Joi.object().keys({
					name: Joi.string().required(),
					role: Joi.string().required()
				})
			)
			.required()
	})
};

const rewriteSection = {
	body: Joi.object().keys({
		sectionContent: Joi.string().required(),
		style: Joi.string().required()
	})
};

const generateAIContract = {
	body: Joi.object().keys({
		prompt: Joi.string().min(10).max(2000).required().messages({
			'string.min': 'Please provide a more detailed description (at least 10 characters)',
			'string.max': 'Description is too long (maximum 2000 characters)',
			'any.required': 'Please describe the contract you want to generate'
		})
	})
};

const updateGeneratedContract = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	}),
	body: Joi.object().keys({
		title: Joi.string(),
		type: Joi.string(),
		description: Joi.string(),
		parties: Joi.string(), // JSON stringified parties
		jurisdiction: Joi.string(),
		startDate: Joi.date(),
		endDate: Joi.date().min(Joi.ref('startDate')),
		content: Joi.string(), // JSON stringified content
		aiPreferences: Joi.object().keys({
			tone: Joi.string().valid('formal', 'casual', 'technical'),
			language: Joi.string(),
			includeDefinitions: Joi.boolean(),
			includeJurisdiction: Joi.boolean(),
			includeDisputeResolution: Joi.boolean()
		})
	})
};

const generateShareableLink = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	}),
	body: Joi.object().keys({
		expiresIn: Joi.number().integer().min(1).max(30).default(7), // Expires in days, max 30 days
		accessType: Joi.string().valid('view', 'comment', 'edit').default('view'),
		shareType: Joi.string().valid('public', 'restricted').required(),
		allowedEmails: Joi.when('shareType', {
			is: 'restricted',
			then: Joi.array().items(Joi.string().email()).min(1).max(10).required(),
			otherwise: Joi.array().items(Joi.string().email()).max(0)
		}),
		regenerate: Joi.boolean().default(false) // Option to generate new link
	})
};

const accessSharedContract = {
	params: Joi.object().keys({
		shareToken: Joi.string().required()
	})
};

const requestContractAccess = {
	params: Joi.object().keys({
		shareToken: Joi.string().required()
	}),
	body: Joi.object().keys({
		email: Joi.string().email().required(),
		reason: Joi.string().max(500).optional()
	})
};

const updateAccessRequest = {
	params: Joi.object().keys({
		shareToken: Joi.string().required(),
		email: Joi.string().email().required()
	}),
	body: Joi.object().keys({
		status: Joi.string().valid('approved', 'rejected').required(),
		responseNote: Joi.string().max(500).optional()
	})
};

const analyzeContract = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	}),
	body: Joi.object().keys({
		analysisType: Joi.string().valid('risk', 'compliance', 'terms', 'all').default('all'),
		jurisdiction: Joi.string().optional(),
		industry: Joi.string().optional(),
		additionalContext: Joi.string().optional()
	})
};

const saveAsTemplate = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	}),
	body: Joi.object().keys({
		templateName: Joi.string().min(3).max(100).required(),
		description: Joi.string().max(500).optional(),
		category: Joi.string().min(2).max(100).required(),
		isPublic: Joi.boolean().default(false)
	})
};

const addContractComment = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	}),
	body: Joi.object().keys({
		content: Joi.string().required().min(1).max(1000),
		// Update context to be a simple string, optional, default 'General'
		context: Joi.string().optional().default('General'),
		parentCommentId: Joi.string().custom(mongoId).optional()
	})
};

const getContractComments = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required()
	}),
	query: Joi.object().keys({
		context: Joi.string().optional(), // was: section
		resolved: Joi.boolean().optional(),
		page: Joi.number().integer().min(1).default(1),
		limit: Joi.number().integer().min(1).max(100).default(20)
	})
};

const resolveContractComment = {
	params: Joi.object().keys({
		contractId: Joi.string().custom(mongoId).required(),
		commentId: Joi.string().custom(mongoId).required()
	})
};

const compareMarketStandards = {
	params: Joi.object().keys({
		contractId: Joi.string().required()
	}),
	body: Joi.object().keys({
		industry: Joi.string().required(),
		jurisdiction: Joi.string().required(),
		contractType: Joi.string().required()
	})
};

const sendContractEmail = {
	body: Joi.object().keys({
		recipients: Joi.array().items(Joi.string().email()).min(1).required(),
		subject: Joi.string().max(200).required(),
		message: Joi.string().max(2000).optional(),
		format: Joi.string().valid('pdf', 'editable_link', 'view_link').required(),
		expiresIn: Joi.when('format', {
			is: Joi.valid('editable_link', 'view_link'),
			then: Joi.number().integer().min(1).max(30).default(7),
			otherwise: Joi.forbidden()
		}),
		accessType: Joi.when('format', {
			is: Joi.valid('editable_link', 'view_link'),
			then: Joi.string().valid('view', 'comment', 'edit').default('view'),
			otherwise: Joi.forbidden()
		}),
		shareType: Joi.when('format', {
			is: Joi.valid('editable_link', 'view_link'),
			then: Joi.string().valid('public', 'restricted').required(),
			otherwise: Joi.forbidden()
		}),
		allowedEmails: Joi.when('shareType', {
			is: 'restricted',
			then: Joi.array().items(Joi.string().email()).min(1).max(10).required(),
			otherwise: Joi.array().items(Joi.string().email()).max(0)
		}),
		regenerate: Joi.when('format', {
			is: Joi.valid('editable_link', 'view_link'),
			then: Joi.boolean().default(false),
			otherwise: Joi.forbidden()
		})
	})
};

export default {
	createContract,
	getContract,
	getUserContracts,
	updateContract,
	autoSaveContract,
	deleteContract,
	generateSections,
	rewriteSection,
	generateAIContract,
	updateGeneratedContract,
	generateShareableLink,
	accessSharedContract,
	requestContractAccess,
	updateAccessRequest,
	analyzeContract,
	saveAsTemplate,
	addContractComment,
	getContractComments,
	resolveContractComment,
	compareMarketStandards,
	sendContractEmail,
	downloadContractPDF,
	modifyContractWithPrompt
};
