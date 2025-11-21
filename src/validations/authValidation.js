import Joi from 'joi';

export const signup = {
	body: Joi.object().keys({
		userName: Joi.string().alphanum().min(6).max(66).required(),
		email: Joi.string().email().required(),
		password: Joi.string().trim().min(6).max(666).required(),
		confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
			'any.only': 'Passwords do not match',
			'any.required': 'Please confirm your password'
		})
	})
};

export const signin = {
	body: Joi.object().keys({
		identifier: Joi.string().required().messages({
			'string.empty': 'Email or username is required',
			'any.required': 'Email or username is required'
		}),
		password: Joi.string().required().messages({
			'string.empty': 'Password is required',
			'any.required': 'Password is required'
		})
	})
};

export const signout = {
	body: Joi.object().keys({
		refreshToken: Joi.string().required()
	})
};

export const refreshTokens = {
	body: Joi.object().keys({
		refreshToken: Joi.string().required()
	})
};

export const forgotPassword = {
	body: Joi.object().keys({
		email: Joi.string().email().required()
	})
};

export const resetPassword = {
	body: Joi.object().keys({
		email: Joi.string().email().required(),
		otp: Joi.string()
			.length(6)
			.pattern(/^[0-9]+$/)
			.required()
			.messages({
				'string.length': 'OTP must be exactly 6 digits',
				'string.pattern.base': 'OTP must contain only numbers'
			}),
		password: Joi.string().trim().min(6).max(666).required(),
		confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
			'any.only': 'Passwords do not match',
			'any.required': 'Please confirm your password'
		})
	})
};

export const verifyEmail = {
	body: Joi.object().keys({
		otp: Joi.string()
			.pattern(/^[0-9]{6}$/)
			.required()
			.messages({
				'string.pattern.base': 'OTP must be exactly 6 digits',
				'any.required': 'OTP is required'
			})
	})
};

export const updateMe = {
	body: Joi.object().keys({
		firstName: Joi.string().trim().min(2).max(66).messages({
			'string.min': 'First name must be at least 2 characters',
			'string.max': 'First name must not exceed 66 characters'
		}),
		lastName: Joi.string().trim().min(2).max(66).messages({
			'string.min': 'Last name must be at least 2 characters',
			'string.max': 'Last name must not exceed 66 characters'
		}),
		userName: Joi.string().alphanum().min(6).max(66),
		email: Joi.string().email(),
		password: Joi.string().trim().min(6).max(666),
		avatar: Joi.string().max(666)
	})
};

export const googleAuth = {
	query: Joi.object().keys({
		isSignup: Joi.boolean().default(false)
	})
};

export const checkUsername = {
	query: Joi.object().keys({
		userName: Joi.string().alphanum().min(6).max(66).required().messages({
			'string.alphanum': 'Username must contain only letters and numbers',
			'string.min': 'Username must be at least 6 characters',
			'string.max': 'Username must not exceed 66 characters',
			'any.required': 'Username is required'
		})
	})
};

export default {
	signup,
	signin,
	updateMe,
	signout,
	refreshTokens,
	verifyEmail,
	forgotPassword,
	resetPassword,
	googleAuth,
	checkUsername
};
