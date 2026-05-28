import { logger } from '../lib/logger.js'
import {
  buildRequestIdentifiers,
  formatRequestLogTags,
  syncRequestLogContext,
} from '../lib/request-log-context.js'

/**
 * One structured log line per HTTP request on response finish.
 * Must run after requestContext (req.requestId) and before routes.
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - startTime
    const ids = syncRequestLogContext(req)
    const path = req.originalUrl?.split('?')[0] || req.path
    const tags = formatRequestLogTags(ids)
    const msg = `${req.method} ${path} → ${res.statusCode} in ${duration}ms ${tags}`

    const payload = {
      event: 'http.request',
      msg,
      ...ids,
      path,
      status: res.statusCode,
      duration,
      ...(req.query && Object.keys(req.query).length > 0
        ? { queryKeys: Object.keys(req.query) }
        : {}),
    }

    if (res.statusCode >= 500) {
      logger.error(payload)
    } else if (res.statusCode >= 400) {
      logger.warn(payload)
    } else {
      logger.info(payload)
    }

    if (duration > 1000 && res.statusCode < 500) {
      logger.warn({
        event: 'http.request.slow',
        msg: `Slow request: ${req.method} ${path} took ${duration}ms ${tags}`,
        ...ids,
        path,
        duration,
        status: res.statusCode,
      })
    }
  })

  next()
}
