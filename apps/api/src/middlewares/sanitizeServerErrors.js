import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'

const GENERIC_MESSAGE = 'Internal server error'

/**
 * 5xx statuses whose handler-written message is an intentional operator/retry hint
 * (503 "try again shortly"), so the message is kept; details/stack are still removed.
 */
const KEEP_MESSAGE_STATUSES = new Set([503])

/** Local development keeps full error text (matches errorHandler's development behaviour). */
function exposeServerErrorsByDefault() {
  return config.APP_ENV === 'dev' && process.env.NODE_ENV !== 'production'
}

/**
 * Central guard for the ~300 route handlers that catch an error and answer
 * `res.status(500).json({ error: { message: error.message, details: error.message } })`.
 * Those strings can carry SQL, table names, file paths or upstream responses. Outside local dev
 * this wraps res.json so any 5xx body with an `error` object loses `details` / `stack`, and its
 * `message` is replaced by a generic one (503 keeps its curated message). `name`, `code`, `ok`,
 * `data` and `requestId` are preserved. 4xx and 2xx bodies are never touched. The original text is
 * logged server-side with the requestId so it stays debuggable.
 *
 * @param {{ expose?: boolean }} [options] override for tests; defaults to local dev only.
 */
export function sanitizeServerErrors(options = {}) {
  const expose = options.expose ?? exposeServerErrorsByDefault()

  return function sanitizeServerErrorsMiddleware(req, res, next) {
    if (expose) return next()

    const originalJson = res.json.bind(res)
    res.json = function sanitizedJson(body) {
      const status = res.statusCode
      const error = body && typeof body === 'object' && !Array.isArray(body) ? body.error : null
      if (status >= 500 && error && typeof error === 'object') {
        const { message, details, stack, ...rest } = error
        logger.warn('Sanitized 5xx error body', {
          requestId: req.requestId,
          status,
          name: rest.name,
          message: typeof message === 'string' ? message.slice(0, 500) : undefined,
          hadDetails: details !== undefined,
        })
        const safeError = { ...rest }
        if (KEEP_MESSAGE_STATUSES.has(status) && typeof message === 'string') {
          safeError.message = message
        } else {
          safeError.message = GENERIC_MESSAGE
        }
        return originalJson({ ...body, error: safeError })
      }
      return originalJson(body)
    }
    return next()
  }
}
