import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

const envValidate = Joi.object()
	.keys({
		NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
		APP_NAME: Joi.string().allow('').empty('').default('App Name'),
		HOST: Joi.string().allow('').empty('').default('0.0.0.0'),
		PORT: Joi.number().allow('').empty('').default(666),

		DATABASE_URI: Joi.string().required(),

		JWT_ACCESS_TOKEN_SECRET_PRIVATE: Joi.string().required(),
		JWT_ACCESS_TOKEN_SECRET_PUBLIC: Joi.string().required(),
		JWT_ACCESS_TOKEN_EXPIRATION_MINUTES: Joi.number().allow('').empty('').default(240),

		REFRESH_TOKEN_EXPIRATION_DAYS: Joi.number().allow('').empty('').default(1),
		VERIFY_EMAIL_TOKEN_EXPIRATION_MINUTES: Joi.number().allow('').empty('').default(60),
		RESET_PASSWORD_TOKEN_EXPIRATION_MINUTES: Joi.number().allow('').empty('').default(30),

		SMTP_HOST: Joi.string().allow('').empty(''),
		SMTP_PORT: Joi.number().allow('').empty(''),
		SMTP_USERNAME: Joi.string().allow('').empty(''),
		SMTP_PASSWORD: Joi.string().allow('').empty(''),
		EMAIL_FROM: Joi.string().allow('').empty(''),

		FRONTEND_URL: Joi.string().allow('').empty('').default('http://localhost:777'),
		IMAGE_URL: Joi.string().allow('').empty('').default('http://localhost:666/images'),
		GOOGLE_AI_API_KEY: Joi.string().required(),

		CLOUDINARY_CLOUD_NAME: Joi.string().allow('').empty(''),
		CLOUDINARY_API_KEY: Joi.string().allow('').empty(''),
		CLOUDINARY_API_SECRET: Joi.string().allow('').empty(''),

		AADHAAR_API_KEY: Joi.string().allow('').empty(''),
		AADHAAR_API_SECRET: Joi.string().allow('').empty(''),
		AADHAAR_API_URL: Joi.string().allow('').empty('').default('https://esign.aadhaar.gov.in'),

		GOOGLE_CLIENT_ID: Joi.string().allow('').empty(''),
		GOOGLE_CLIENT_SECRET: Joi.string().allow('').empty(''),
		GOOGLE_CALLBACK_URL: Joi.string().allow('').empty('').default('http://localhost:666/api/v1/auth/google/callback'),

		RAZORPAY_KEY_ID: Joi.string().allow('').empty(''),
		RAZORPAY_KEY_SECRET: Joi.string().allow('').empty('')
	})
	.unknown();

const { value: env, error } = envValidate.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
	throw new Error(`Config env error: ${error.message}`);
}

export default {
	NODE_ENV: env.NODE_ENV,
	APP_NAME: env.APP_NAME,
	HOST: env.HOST,
	PORT: env.PORT,

	DATABASE_URI: env.DATABASE_URI,
	DATABASE_OPTIONS: {
		useNewUrlParser: true,
		useUnifiedTopology: true,
		retryWrites: true,
		w: 'majority'
	},

	JWT_ACCESS_TOKEN_SECRET_PRIVATE: Buffer.from(env.JWT_ACCESS_TOKEN_SECRET_PRIVATE, 'base64'),
	JWT_ACCESS_TOKEN_SECRET_PUBLIC: Buffer.from(env.JWT_ACCESS_TOKEN_SECRET_PUBLIC, 'base64'),
	JWT_ACCESS_TOKEN_EXPIRATION_MINUTES: env.JWT_ACCESS_TOKEN_EXPIRATION_MINUTES,

	REFRESH_TOKEN_EXPIRATION_DAYS: env.REFRESH_TOKEN_EXPIRATION_DAYS,
	VERIFY_EMAIL_TOKEN_EXPIRATION_MINUTES: env.VERIFY_EMAIL_TOKEN_EXPIRATION_MINUTES,
	RESET_PASSWORD_TOKEN_EXPIRATION_MINUTES: env.RESET_PASSWORD_TOKEN_EXPIRATION_MINUTES,

	SMTP_HOST: env.SMTP_HOST,
	SMTP_PORT: env.SMTP_PORT,
	SMTP_USERNAME: env.SMTP_USERNAME,
	SMTP_PASSWORD: env.SMTP_PASSWORD,
	EMAIL_FROM: env.EMAIL_FROM,

	FRONTEND_URL: env.FRONTEND_URL,

	IMAGE_URL: env.IMAGE_URL,

	TOKEN_TYPES: {
		REFRESH: 'refresh',
		VERIFY_EMAIL: 'verifyEmail',
		RESET_PASSWORD: 'resetPassword'
	},

	cloudinary: {
		cloudName: env.CLOUDINARY_CLOUD_NAME,
		apiKey: env.CLOUDINARY_API_KEY,
		apiSecret: env.CLOUDINARY_API_SECRET
	},

	streamConfig: {
		apiKey: process.env.STREAM_API_KEY,
		apiSecret: process.env.STREAM_API_SECRET,
		appId: process.env.STREAM_APP_ID
	},

	aadhaar: {
		apiKey: env.AADHAAR_API_KEY,
		apiSecret: env.AADHAAR_API_SECRET,
		apiUrl: env.AADHAAR_API_URL
	},

	email: {
		smtp: {
			host: env.SMTP_HOST,
			port: env.SMTP_PORT,
			secure: env.SMTP_SECURE === 'true',
			auth: {
				user: env.SMTP_USERNAME,
				pass: env.SMTP_PASSWORD
			}
		},
		from: env.EMAIL_FROM || 'noreply@lexiflow.com'
	},

	google: {
		clientId: env.GOOGLE_CLIENT_ID,
		clientSecret: env.GOOGLE_CLIENT_SECRET,
		callbackURL: env.GOOGLE_CALLBACK_URL
	},

	googleAI: {
		apiKey: env.GOOGLE_AI_API_KEY
	},

	razorpay: {
		keyId: env.RAZORPAY_KEY_ID,
		keySecret: env.RAZORPAY_KEY_SECRET
	}
};
