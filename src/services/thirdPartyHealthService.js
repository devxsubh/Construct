import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/config.js';
import logger from '../config/logger.js';
import mongoose from 'mongoose';

/**
 * Comprehensive third-party API health check service
 * Checks all external APIs and services used by the application
 */
class ThirdPartyHealthService {
	constructor() {
		this.timeout = 5000; // 5 second timeout per check
	}

	/**
	 * Check Google AI (Gemini) API health
	 */
	async checkGoogleAI() {
		const startTime = Date.now();
		try {
			if (!config.googleAI.apiKey) {
				return {
					status: 'not_configured',
					message: 'Google AI API key not configured',
					responseTime: null
				};
			}

			const googleAI = new GoogleGenerativeAI(config.googleAI.apiKey);
			const modelNames = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-pro'];
			let lastError = null;
			let workingModel = null;

			for (const modelName of modelNames) {
				try {
					const model = googleAI.getGenerativeModel({ model: modelName });
					await Promise.race([
						model.generateContent('test'),
						new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.timeout))
					]);
					workingModel = modelName;
					break;
				} catch (error) {
					lastError = error;
					continue;
				}
			}

			if (!workingModel) {
				const responseTime = Date.now() - startTime;
				return {
					status: 'unhealthy',
					message: lastError?.message || 'All Google AI models failed',
					responseTime: `${responseTime}ms`,
					error: lastError?.message
				};
			}

			const responseTime = Date.now() - startTime;
			return {
				status: 'healthy',
				message: 'Google AI API is responding',
				responseTime: `${responseTime}ms`,
				model: workingModel
			};
		} catch (error) {
			const responseTime = Date.now() - startTime;
			return {
				status: 'unhealthy',
				message: error.message || 'Google AI API check failed',
				responseTime: `${responseTime}ms`,
				error: error.message
			};
		}
	}


	/**
	 * Check MongoDB database connection
	 */
	async checkDatabase() {
		const startTime = Date.now();
		try {
			const state = mongoose.connection.readyState;
			// 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting

			if (state === 1) {
				// Test with a simple query
				await Promise.race([
					mongoose.connection.db.admin().ping(),
					new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.timeout))
				]);

				const responseTime = Date.now() - startTime;
				return {
					status: 'healthy',
					message: 'MongoDB is connected and responding',
					responseTime: `${responseTime}ms`,
					state: 'connected'
				};
			} else {
				const states = {
					0: 'disconnected',
					1: 'connected',
					2: 'connecting',
					3: 'disconnecting'
				};
				return {
					status: 'unhealthy',
					message: `MongoDB connection state: ${states[state] || 'unknown'}`,
					responseTime: null,
					state: states[state]
				};
			}
		} catch (error) {
			const responseTime = Date.now() - startTime;
			return {
				status: 'unhealthy',
				message: error.message || 'Database check failed',
				responseTime: `${responseTime}ms`,
				error: error.message
			};
		}
	}

	/**
	 * Check SMTP/Email service
	 */
	async checkEmailService() {
		const startTime = Date.now();
		try {
			if (!config.SMTP_HOST || !config.SMTP_USERNAME) {
				return {
					status: 'not_configured',
					message: 'SMTP not configured',
					responseTime: null
				};
			}

			// Test SMTP connection (without sending email)
			const nodemailer = await import('nodemailer');
			const transporter = nodemailer.default.createTransport({
				host: config.SMTP_HOST,
				port: config.SMTP_PORT,
				secure: config.email?.smtp?.secure || false,
				auth: {
					user: config.SMTP_USERNAME,
					pass: config.SMTP_PASSWORD
				}
			});

			await Promise.race([
				transporter.verify(),
				new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.timeout))
			]);

			const responseTime = Date.now() - startTime;
			return {
				status: 'healthy',
				message: 'SMTP server is accessible',
				responseTime: `${responseTime}ms`,
				host: config.SMTP_HOST
			};
		} catch (error) {
			const responseTime = Date.now() - startTime;
			return {
				status: 'unhealthy',
				message: error.message || 'SMTP check failed',
				responseTime: `${responseTime}ms`,
				error: error.message
			};
		}
	}

	/**
	 * Check Cloudinary service
	 */
	async checkCloudinary() {
		const startTime = Date.now();
		try {
			if (!config.cloudinary.cloudName || !config.cloudinary.apiKey) {
				return {
					status: 'not_configured',
					message: 'Cloudinary not configured',
					responseTime: null
				};
			}

			// Test Cloudinary API
			const { v2: cloudinary } = await import('cloudinary');
			cloudinary.config({
				cloud_name: config.cloudinary.cloudName,
				api_key: config.cloudinary.apiKey,
				api_secret: config.cloudinary.apiSecret
			});

			await Promise.race([
				cloudinary.api.ping(),
				new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.timeout))
			]);

			const responseTime = Date.now() - startTime;
			return {
				status: 'healthy',
				message: 'Cloudinary API is responding',
				responseTime: `${responseTime}ms`
			};
		} catch (error) {
			const responseTime = Date.now() - startTime;
			return {
				status: 'unhealthy',
				message: error.message || 'Cloudinary check failed',
				responseTime: `${responseTime}ms`,
				error: error.message
			};
		}
	}

	/**
	 * Check Razorpay payment gateway
	 */
	async checkRazorpay() {
		const startTime = Date.now();
		try {
			if (!config.razorpay.keyId || !config.razorpay.keySecret) {
				return {
					status: 'not_configured',
					message: 'Razorpay not configured',
					responseTime: null
				};
			}

			// Test Razorpay API (check authentication)
			const Razorpay = (await import('razorpay')).default;
			const razorpay = new Razorpay({
				key_id: config.razorpay.keyId,
				key_secret: config.razorpay.keySecret
			});

			// Try to fetch payment methods (lightweight check)
			await Promise.race([
				razorpay.payments.all({ count: 1 }),
				new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.timeout))
			]);

			const responseTime = Date.now() - startTime;
			return {
				status: 'healthy',
				message: 'Razorpay API is responding',
				responseTime: `${responseTime}ms`
			};
		} catch (error) {
			const responseTime = Date.now() - startTime;
			// Razorpay might return 404 if no payments exist, which is still healthy
			if (error.statusCode === 404 || error.message?.includes('not found')) {
				return {
					status: 'healthy',
					message: 'Razorpay API is accessible (no payments found)',
					responseTime: `${responseTime}ms`
				};
			}
			return {
				status: 'unhealthy',
				message: error.message || 'Razorpay check failed',
				responseTime: `${responseTime}ms`,
				error: error.message
			};
		}
	}

	/**
	 * Check all third-party APIs
	 * @param {Object} options - Check options
	 * @param {Array} options.services - Specific services to check (optional, checks all if not provided)
	 * @returns {Promise<Object>} - Health check results
	 */
	async checkAll(options = {}) {
		const { services } = options;
		const results = {
			timestamp: new Date().toISOString(),
			overall: 'healthy',
			services: {}
		};

		const checks = [];

		// Define all available checks
		const allChecks = {
			googleAI: () => this.checkGoogleAI(),
			database: () => this.checkDatabase(),
			email: () => this.checkEmailService(),
			cloudinary: () => this.checkCloudinary(),
			razorpay: () => this.checkRazorpay()
		};

		// Determine which services to check
		const servicesToCheck = services && services.length > 0 ? services : Object.keys(allChecks);

		// Run all checks in parallel
		const checkPromises = servicesToCheck.map(async (service) => {
			if (allChecks[service]) {
				try {
					const result = await allChecks[service]();
					results.services[service] = result;
					return result.status === 'healthy';
				} catch (error) {
					results.services[service] = {
						status: 'error',
						message: error.message || 'Check failed',
						error: error.message
					};
					return false;
				}
			} else {
				results.services[service] = {
					status: 'unknown',
					message: `Unknown service: ${service}`
				};
				return false;
			}
		});

		await Promise.all(checkPromises);

		// Determine overall health
		const serviceStatuses = Object.values(results.services).map((s) => s.status);
		const hasUnhealthy = serviceStatuses.some((status) => status === 'unhealthy' || status === 'error');
		const hasNotConfigured = serviceStatuses.some((status) => status === 'not_configured');
		const hasHealthy = serviceStatuses.some((status) => status === 'healthy');

		if (hasUnhealthy) {
			results.overall = 'unhealthy';
		} else if (hasNotConfigured && !hasHealthy) {
			results.overall = 'not_configured';
		} else if (hasNotConfigured && hasHealthy) {
			results.overall = 'degraded';
		} else {
			results.overall = 'healthy';
		}

		// Add summary
		results.summary = {
			total: servicesToCheck.length,
			healthy: serviceStatuses.filter((s) => s === 'healthy').length,
			unhealthy: serviceStatuses.filter((s) => s === 'unhealthy' || s === 'error').length,
			notConfigured: serviceStatuses.filter((s) => s === 'not_configured').length
		};

		return results;
	}
}

export default new ThirdPartyHealthService();

