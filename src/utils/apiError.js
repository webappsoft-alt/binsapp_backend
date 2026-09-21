import { logger } from "../config/logger.js";
import { toErrorMessage, twilioFieldsFromUnknown } from "./errorMessage.js";

/**
 * Base API Error Class
 */
export class ApiError extends Error {
  constructor(
    code,
    statusCode,
    message,
    details = null,
    errors = [],
    metadata = {}
  ) {
    const textMessage = toErrorMessage(message, "An error occurred");
    super(textMessage);
    this.statusCode = statusCode;
    this.code = typeof code === "string" ? code : "INTERNAL_SERVER_ERROR";
    this.details = details ? toErrorMessage(details, textMessage) : textMessage;
    this.errors = errors;
    this.metadata = metadata;
    this.name = this.constructor.name;

    if (!this.metadata.twilio) {
      const twilio = twilioFieldsFromUnknown(message) ?? twilioFieldsFromUnknown(code);
      if (twilio) {
        this.metadata = { ...this.metadata, twilio };
      }
    }

    if (process.env.NODE_ENV === "production") {
      Error.captureStackTrace(this, this.constructor);
    }

    // Log the error
    logger.error({
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      errors: this.errors,
      metadata: this.metadata,
      stack: this.stack,
    });
  }

  /**
   * Format the error response
   */
  format(res) {
    const text = toErrorMessage(this.message, toErrorMessage(this.details));
    const response = {
      success: false,
      code: this.code,
      message: text,
      error: text,
      msg: text,
      status: this.statusCode,
      timestamp: new Date().toISOString(),
      correlationId: res.locals?.correlationId || null,
    };

    if (this.errors.length > 0) response.errors = this.errors;
    if (this.metadata?.twilio) {
      response.twilio = this.metadata.twilio;
    }
    if (
      this.metadata &&
      Object.keys(this.metadata).length > 0 &&
      process.env.NODE_ENV !== "production"
    )
      response.metadata = this.metadata;

    if (process.env.NODE_ENV !== "production") {
      response.stack = this.stack;
    }

    return res.status(this.statusCode).json(response);
  }
}

// Concrete Error Classes

export class BadRequestError extends ApiError {
  constructor(message = "Bad request", errors = [], metadata = {}) {
    super("BAD_REQUEST", 400, message, "Bad Request", errors, metadata);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication required", metadata = {}) {
    super("UNAUTHORIZED", 401, message, "Unauthorized", [], metadata);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Insufficient permissions", metadata = {}) {
    super("FORBIDDEN", 403, message, "Forbidden", [], metadata);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found", metadata = {}) {
    super("NOT_FOUND", 404, message, "Not Found", [], metadata);
  }
}

export class PermissionError extends ApiError {
  constructor(message = "Permission denied", metadata = {}) {
    super("PERMISSION_DENIED", 403, message, "Permission denied", [], metadata);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Resource conflict", metadata = {}) {
    super("CONFLICT", 409, message, "Conflict", [], metadata);
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Validation failed", errors = [], metadata = {}) {
    super(
      "VALIDATION_ERROR",
      422,
      message,
      "Validation Error",
      errors,
      metadata
    );
  }
}

export class DatabaseError extends ApiError {
  constructor(message = "Database operation failed", metadata = {}) {
    super("DATABASE_ERROR", 500, message, "Database Error", [], metadata);
  }
}

export class ConfigurationError extends ApiError {
  constructor(message = "Server misconfiguration", metadata = {}) {
    super(
      "CONFIGURATION_ERROR",
      500,
      message,
      "Configuration Error",
      [],
      metadata
    );
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message = "Rate limit exceeded", metadata = {}) {
    super("TOO_MANY_REQUESTS", 429, message, "Too many requests", [], metadata);
  }
}

export class BookingError extends ApiError {
  constructor(message = "Booking error occurred", metadata = {}) {
    super("BOOKING_ERROR", 400, message, "Booking Error", [], metadata);
  }
}

export class InvalidInputError extends ApiError {
  constructor(message = "Invalid input provided", errors = [], metadata = {}) {
    super("INVALID_INPUT", 400, message, "Invalid input", errors, metadata);
  }
}

export class InternalServerError extends ApiError {
  constructor(message = "Something went wrong", metadata = {}) {
    super(
      "INTERNAL_SERVER_ERROR",
      500,
      message,
      "Internal Server Error",
      [],
      metadata
    );
  }
}

export class AuthError extends ApiError {
  constructor(message = "Authentication error", metadata = {}) {
    super("AUTH_ERROR", 401, message, "Authentication Error", [], metadata);
  }
}

/**
 * Type guard for API errors
 */
export const isApiError = (error) => {
  return error instanceof ApiError;
};
