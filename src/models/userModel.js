import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import paginate from './plugins/paginatePlugin.js';
import toJSON from './plugins/toJSONPlugin.js';
import APIError from '../utils/apiError.js';
import config from '../config/config.js';
import httpStatus from 'http-status';
import Role from './roleModel.js';

const userSchema = mongoose.Schema(
	{
		firstName: {
			type: String,
			required: false
		},
		lastName: {
			type: String,
			required: false
		},
		userName: {
			type: String,
			required: true,
			unique: true
		},
		email: {
			type: String,
			required: true,
			unique: true
		},
		password: {
			type: String,
			required: true,
			private: true
		},
		avatar: {
			type: String,
			default: 'avatar.png'
		},
		confirmed: {
			type: Boolean,
			default: false
		},
		contractCount: {
			type: Number,
			default: 0,
			min: 0
		},
		subscriptionStatus: {
			type: String,
			enum: ['free', 'active', 'expired', 'cancelled'],
			default: 'free'
		},
		roles: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Role'
			}
		]
	},
	{
		timestamps: true,
		toJSON: { virtuals: true }
	}
);

userSchema.plugin(toJSON);
userSchema.plugin(paginate);

userSchema.virtual('avatarUrl').get(function () {
	return config.IMAGE_URL + '/' + this.avatar;
});

class UserClass {
	static async isUserNameAlreadyExists(userName, excludeUserId) {
		return !!(await this.findOne({ userName, _id: { $ne: excludeUserId } }));
	}

	static async isEmailAlreadyExists(email, excludeUserId) {
		return !!(await this.findOne({ email, _id: { $ne: excludeUserId } }));
	}

	static async getUserById(id) {
		return await this.findById(id);
	}

	static async getUserByUserName(userName) {
		return await this.findOne({ userName });
	}

	static async getUserByEmail(email) {
		return await this.findOne({ email });
	}

	static async getUserByIdentifier(identifier) {
		// Check if identifier is an email (contains @ symbol)
		const isEmail = identifier.includes('@');

		if (isEmail) {
			return await this.findOne({ email: identifier });
		} else {
			return await this.findOne({ userName: identifier });
		}
	}

	static async createUser(body) {
		if (await this.isUserNameAlreadyExists(body.userName)) {
			throw new APIError('User name already exists', httpStatus.BAD_REQUEST);
		}
		if (await this.isEmailAlreadyExists(body.email)) {
			throw new APIError('Email already exists', httpStatus.BAD_REQUEST);
		}

		// Validate roles if provided
		if (body.roles && body.roles.length > 0) {
			await Promise.all(
				body.roles.map(async (roleId) => {
					if (!(await Role.findById(roleId))) {
						throw new APIError('Role does not exist', httpStatus.BAD_REQUEST);
					}
				})
			);
		} else {
			// Default to User role if no roles provided
			const userRole = await Role.findOne({ name: 'User' });
			if (userRole) {
				body.roles = [userRole._id];
			}
		}

		return await this.create(body);
	}

	static async updateUserById(userId, body) {
		const user = await this.getUserById(userId);
		if (!user) {
			throw new APIError('User not found', httpStatus.NOT_FOUND);
		}
		if (await this.isUserNameAlreadyExists(body.userName, userId)) {
			throw new APIError('User name already exists', httpStatus.BAD_REQUEST);
		}
		if (await this.isEmailAlreadyExists(body.email, userId)) {
			throw new APIError('Email already exists', httpStatus.BAD_REQUEST);
		}

		// Validate roles if provided
		if (body.roles && body.roles.length > 0) {
			await Promise.all(
				body.roles.map(async (roleId) => {
					if (!(await Role.findById(roleId))) {
						throw new APIError('Role does not exist', httpStatus.BAD_REQUEST);
					}
				})
			);
		}

		Object.assign(user, body);
		return await user.save();
	}

	static async deleteUserById(userId) {
		const user = await this.getUserById(userId);
		if (!user) {
			throw new APIError('User not found', httpStatus.NOT_FOUND);
		}
		return await user.remove();
	}

	async isPasswordMatch(password) {
		return bcrypt.compareSync(password, this.password);
	}
}

userSchema.loadClass(UserClass);

userSchema.pre('save', async function (next) {
	if (this.isModified('password')) {
		const passwordGenSalt = bcrypt.genSaltSync(10);
		this.password = bcrypt.hashSync(this.password, passwordGenSalt);
	}
	next();
});

const User = mongoose.model('User', userSchema);

export default User;
