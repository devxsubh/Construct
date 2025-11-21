import APIError from '../utils/apiError.js';
import tokenService from '../services/tokenService.js';
import emailService from '../services/emailService/index.js';
import User from '../models/userModel.js';
import config from '../config/config.js';
import httpStatus from 'http-status';
import Token from '../models/tokenModel.js';
import Role from '../models/roleModel.js';
import passport from 'passport';
import logger from '../config/logger.js';
// ClientPortal model removed - simplified app
import notificationService from '../services/notificationService.js';

export const googleAuth = async (req, res, next) => {
	const { isSignup } = req.query;

	passport.authenticate('google', {
		scope: ['profile', 'email'],
		prompt: isSignup ? 'select_account' : undefined, // Only force account selector for signup
		accessType: 'offline',
		includeGrantedScopes: true
	})(req, res, next);
};

export const googleAuthCallback = async (req, res, next) => {
	passport.authenticate(
		'google',
		{
			failureRedirect: '/login',
			failureMessage: true
		},
		async (err, user) => {
			if (err) {
				logger.error('Google auth error:', err);
				return res.redirect(`${config.FRONTEND_URL}/auth/error?message=${encodeURIComponent(err.message)}`);
			}

			if (!user) {
				logger.error('No user returned from Google auth');
				return res.redirect(`${config.FRONTEND_URL}/auth/error?message=${encodeURIComponent('Authentication failed')}`);
			}

			try {
				// Generate auth tokens
				const tokens = await tokenService.generateAuthTokens(user);

				// Redirect to frontend with tokens and isSignup flag
				const redirectUrl = `${config.FRONTEND_URL}/auth/callback?tokens=${encodeURIComponent(JSON.stringify(tokens))}&isSignup=${
					req.query.isSignup === 'true'
				}`;
				res.redirect(redirectUrl);
			} catch (error) {
				logger.error('Token generation error:', error);
				return res.redirect(
					`${config.FRONTEND_URL}/auth/error?message=${encodeURIComponent('Failed to generate authentication tokens')}`
				);
			}
		}
	)(req, res, next);
};

export const signup = async (req, res) => {
	const role = await Role.findOne({ name: 'User' });
	if (!role) {
		throw new APIError('User role not found. Please contact administrator.', httpStatus.INTERNAL_SERVER_ERROR);
	}
	req.body.roles = [role._id];

	// Remove confirmPassword before creating user (not stored in DB)
	// eslint-disable-next-line no-unused-vars
	const { confirmPassword, ...userData } = req.body;

	const user = await User.createUser(userData);
	const tokens = await tokenService.generateAuthTokens(user);

	return res.json({
		success: true,
		data: { user, tokens }
	});
};

export const signin = async (req, res) => {
	const { identifier, password } = req.body;

	// Find user by email or username
	const user = await User.getUserByIdentifier(identifier);

	if (!user || !(await user.isPasswordMatch(password))) {
		throw new APIError('Incorrect email/username or password', httpStatus.BAD_REQUEST);
	}

	const tokens = await tokenService.generateAuthTokens(user);
	return res.json({
		success: true,
		data: { user, tokens }
	});
};

export const current = async (req, res) => {
	const user = await User.getUserById(req.user.id);
	if (!user) {
		throw new APIError('User not found', httpStatus.NOT_FOUND);
	}
	return res.json({
		success: true,
		data: {
			firstName: user.firstName,
			lastName: user.lastName,
			userName: user.userName,
			avatarUrl: user.avatarUrl
		}
	});
};

export const getMe = async (req, res) => {
	const user = await User.getUserById(req.user.id);
	if (!user) {
		throw new APIError('User not found', httpStatus.NOT_FOUND);
	}

	// Populate roles if not already populated
	if (user.roles && user.roles.length > 0) {
		await user.populate('roles');
	}

	return res.json({
		success: true,
		data: user
	});
};

export const updateMe = async (req, res) => {
	const user = await User.updateUserById(req.user.id, req.body);

	// Create notification for profile update
	try {
		await notificationService.createNotification({
			userId: req.user.id,
			type: 'profile_updated',
			title: 'Profile Updated',
			message: 'Your profile has been successfully updated',
			data: {
				updatedFields: Object.keys(req.body).filter((key) => req.body[key] !== undefined),
				updatedAt: new Date()
			},
			priority: 'low',
			actionUrl: '/profile',
			actionText: 'View Profile',
			metadata: {
				source: 'user',
				category: 'profile',
				relatedEntity: req.user.id,
				relatedEntityType: 'User',
				tags: ['update']
			}
		});
	} catch (notificationError) {
		// Log the error but don't fail the profile update
		console.error('Failed to create profile update notification:', notificationError);
	}

	return res.json({
		success: true,
		data: user
	});
};

export const signout = async (req, res) => {
	await Token.revokeToken(req.body.refreshToken, config.TOKEN_TYPES.REFRESH);
	return res.json({
		success: true,
		data: 'Signout success'
	});
};

export const refreshTokens = async (req, res) => {
	try {
		const refreshTokenDoc = await tokenService.verifyToken(req.body.refreshToken, config.TOKEN_TYPES.REFRESH);
		const user = await User.getUserById(refreshTokenDoc.user);
		if (!user) {
			throw new Error();
		}
		await refreshTokenDoc.remove();
		const tokens = await tokenService.generateAuthTokens(user);
		return res.json({
			success: true,
			data: {
				tokens
			}
		});
	} catch (err) {
		throw new APIError(err.message, httpStatus.UNAUTHORIZED);
	}
};

export const sendVerificationEmail = async (req, res) => {
	const user = await User.getUserByEmail(req.user.email);
	if (user.confirmed) {
		throw new APIError('Email verified', httpStatus.BAD_REQUEST);
	}
	const verifyEmailToken = await tokenService.generateVerifyEmailToken(req.user);
	await emailService.sendVerificationEmail(req.user.email, verifyEmailToken);
	return res.json({
		success: true,
		data: 'Send verification email success'
	});
};

export const verifyEmail = async (req, res) => {
	try {
		const { otp } = req.body;

		if (!otp || !/^[0-9]{6}$/.test(otp)) {
			throw new APIError('Invalid OTP format. OTP must be 6 digits', httpStatus.BAD_REQUEST);
		}

		const verifyEmailTokenDoc = await tokenService.verifyToken(otp, config.TOKEN_TYPES.VERIFY_EMAIL);
		const user = await User.getUserById(verifyEmailTokenDoc.user);
		if (!user) {
			throw new Error();
		}

		// Check if email was already verified
		if (user.confirmed) {
			return res.json({
				success: true,
				data: 'Email already verified'
			});
		}

		// Delete verification tokens
		await Token.deleteMany({ user: user.id, type: config.TOKEN_TYPES.VERIFY_EMAIL });

		// Update user as confirmed
		await User.updateUserById(user.id, { confirmed: true });

		// Send welcome email
		try {
			const userName = user.firstName || user.userName || 'there';
			await emailService.sendWelcomeEmail(user.email, userName);
		} catch (emailError) {
			// Log the error but don't fail the verification process
			logger.error('Failed to send welcome email:', emailError);
		}

		// Create notification for email verification
		try {
			await notificationService.createNotification({
				userId: user.id,
				type: 'email_verified',
				title: 'Email Verified',
				message: 'Your email has been successfully verified. Welcome to LexiFlow!',
				data: {
					email: user.email,
					verifiedAt: new Date()
				},
				priority: 'high',
				actionUrl: '/dashboard',
				actionText: 'Go to Dashboard',
				metadata: {
					source: 'system',
					category: 'account',
					relatedEntity: user.id,
					relatedEntityType: 'User',
					tags: ['verification', 'welcome']
				}
			});
		} catch (notificationError) {
			// Log the error but don't fail the verification process
			logger.error('Failed to create email verification notification:', notificationError);
		}

		return res.json({
			success: true,
			data: 'Verify email success'
		});
	} catch (err) {
		throw new APIError('Email verification failed', httpStatus.UNAUTHORIZED);
	}
};

export const forgotPassword = async (req, res) => {
	const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
	await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
	return res.json({
		success: true,
		data: 'Send forgot password email success'
	});
};

export const resetPassword = async (req, res) => {
	try {
		const { otp, email, password, confirmPassword } = req.body;

		if (!otp || !email) {
			throw new APIError('OTP and email are required', httpStatus.BAD_REQUEST);
		}

		// Verify OTP token
		const resetPasswordTokenDoc = await tokenService.verifyToken(otp, config.TOKEN_TYPES.RESET_PASSWORD);
		const user = await User.getUserById(resetPasswordTokenDoc.user);

		if (!user) {
			throw new APIError('User not found', httpStatus.NOT_FOUND);
		}

		// Verify email matches
		if (user.email !== email) {
			throw new APIError('Email does not match', httpStatus.BAD_REQUEST);
		}

		// Delete all reset password tokens for this user
		await Token.deleteMany({ user: user.id, type: config.TOKEN_TYPES.RESET_PASSWORD });

		// Update password
		await User.updateUserById(user.id, { password });

		// Create notification for password reset
		try {
			await notificationService.createNotification({
				userId: user.id,
				type: 'password_reset',
				title: 'Password Reset Successful',
				message:
					'Your password has been successfully reset. If you did not make this change, please contact support immediately.',
				data: {
					resetAt: new Date(),
					ipAddress: req.ip || 'Unknown'
				},
				priority: 'high',
				actionUrl: '/profile',
				actionText: 'View Profile',
				metadata: {
					source: 'system',
					category: 'security',
					relatedEntity: user.id,
					relatedEntityType: 'User',
					tags: ['security', 'password']
				}
			});
		} catch (notificationError) {
			// Log the error but don't fail the password reset
			logger.error('Failed to create password reset notification:', notificationError);
		}

		return res.json({
			success: true,
			data: 'Reset password success'
		});
	} catch (err) {
		throw new APIError('Password reset failed', httpStatus.UNAUTHORIZED);
	}
};

export const checkUsername = async (req, res) => {
	const { userName } = req.query;

	if (!userName) {
		return res.status(httpStatus.BAD_REQUEST).json({
			success: false,
			message: 'Username is required'
		});
	}

	const exists = await User.isUserNameAlreadyExists(userName);

	return res.json({
		success: true,
		data: {
			userName,
			available: !exists,
			exists
		}
	});
};

export default {
	signup,
	signin,
	current,
	getMe,
	updateMe,
	signout,
	refreshTokens,
	sendVerificationEmail,
	verifyEmail,
	forgotPassword,
	resetPassword,
	googleAuth,
	googleAuthCallback,
	checkUsername
};
