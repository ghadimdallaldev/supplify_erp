import { logger } from '../lib/logger.js'
import { syncRequestLogContext } from '../lib/request-log-context.js'
import { writeSystemEvent } from '../lib/systemEvent.js'

/** Map thrown errors to HTTP status + error envelope (shared by handler and system_event). */
export function resolveHttpError(err) {
  let statusCode = 500
  let errorName = 'INTERNAL_ERROR'
  let message = 'Internal server error'

  if (err.name === 'ValidationError') {
    statusCode = 400
    errorName = 'VALIDATION_ERROR'
    message = err.message
  } else if (
    err.name === 'UnauthorizedError' ||
    err.name === 'JWTExpired' ||
    err.code === 'ERR_JWT_EXPIRED'
  ) {
    statusCode = 401
    errorName = 'JWT_EXPIRED'
    message = err.message || 'Token has expired. Please log in again.'
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403
    errorName = 'FORBIDDEN'
    message = 'Forbidden'
  } else if (err.name === 'NotFoundError') {
    statusCode = 404
    errorName = 'NOT_FOUND'
    message = 'Resource not found'
  } else if (err.name === 'ConflictError') {
    statusCode = 409
    errorName = 'CONFLICT'
    message = 'Resource conflict'
  } else if (err.code === '23505') {
    statusCode = 409
    errorName = 'CONFLICT'
    message = 'Resource already exists'
  } else if (err.code === '42P01') {
    statusCode = 503
    errorName = 'SCHEMA_NOT_READY'
    message = 'Database schema is not up to date. Retry after the API finishes migrating.'
  } else if (err.code === '23503') {
    statusCode = 400
    errorName = 'VALIDATION_ERROR'
    message = 'Referenced resource does not exist'
  } else if (err.name === 'ZodError') {
    statusCode = 400
    errorName = 'VALIDATION_ERROR'
    message = err.errors?.map((e) => e.message).join('; ') || 'Validation failed'
  }

  return { statusCode, errorName, message }
}

// Error handling middleware
export function errorHandler(err, req, res, next) {
  const ids = syncRequestLogContext(req)
  const requestId = ids.requestId || 'unknown'
  const { statusCode, errorName, message: publicMessage } = resolveHttpError(err)

  writeSystemEvent({
    type: 'api_error',
    severity: 'error',
    source: req.url?.split('?')[0] || 'unknown',
    payload: {
      ...ids,
      method: req.method,
      message: err.message,
      statusCode,
      errorName,
    },
  }).catch(() => {})

  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    ...ids,
    url: req.url,
    method: req.method,
    ip: req.ip,
  })

  const isDevelopment = process.env.NODE_ENV === 'development'

  // Send error response only if headers haven't been sent
  if (!res.headersSent) {
    res.status(statusCode).json({
      ok: false,
      data: null,
      error: {
        name: errorName,
        message: isDevelopment ? err.message : publicMessage,
        ...(isDevelopment && { stack: err.stack }),
        ...(err.details && { details: err.details }),
      },
      requestId,
    })
  } else {
    // If headers already sent, just log the error
    logger.error('Headers already sent, cannot send error response')
  }
}

// Custom error classes
export class ValidationError extends Error {
  constructor(message, details = null) {
    super(message)
    this.name = 'ValidationError'
    this.details = details
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message)
    this.name = 'NotFoundError'
    this.statusCode = 404
  }
}

export class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message)
    this.name = 'ConflictError'
  }
}
