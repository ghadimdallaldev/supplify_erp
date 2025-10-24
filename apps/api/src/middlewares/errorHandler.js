import { logger } from '../lib/logger.js';

// Error handling middleware
export function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'unknown';
  
  // Log the error
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    requestId,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Determine error type and status code
  let statusCode = 500;
  let errorName = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorName = 'VALIDATION_ERROR';
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorName = 'UNAUTHORIZED';
    message = 'Unauthorized';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorName = 'FORBIDDEN';
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
    errorName = 'NOT_FOUND';
    message = 'Resource not found';
  } else if (err.name === 'ConflictError') {
    statusCode = 409;
    errorName = 'CONFLICT';
    message = 'Resource conflict';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    errorName = 'CONFLICT';
    message = 'Resource already exists';
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    errorName = 'VALIDATION_ERROR';
    message = 'Referenced resource does not exist';
  }

  // Send error response
  res.status(statusCode).json({
    ok: false,
    data: null,
    error: {
      name: errorName,
      message: isDevelopment ? err.message : message,
      ...(isDevelopment && { stack: err.stack }),
      ...(err.details && { details: err.details }),
    },
    requestId,
  });
}

// Custom error classes
export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}
