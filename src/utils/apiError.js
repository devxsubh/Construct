class APIError extends Error {
	constructor(message, status, isOperational = true, metadata = null) {
		super(message);
		this.name = this.constructor.name;
		this.message = message;
		this.status = status;
		this.isOperational = isOperational;
		this.metadata = metadata; // Support for additional error metadata
		Error.captureStackTrace(this, this.constructor);
	}
}

export default APIError;
