import { randomUUID } from 'node:crypto'
import { createRequestLogger } from '../lib/logger.js'
import { requestLogStore } from '../lib/request-log-store.js'
import { syncRequestLogContext } from '../lib/request-log-context.js'

// Request context middleware
export function requestContext(req, res, next) {
  const headerId = req.headers['x-request-id']
  req.requestId =
    typeof headerId === 'string' && headerId.trim() ? headerId.trim() : randomUUID().split('-')[0]

  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress

  req.logger = createRequestLogger(req.requestId, ip)
  req.syncLogContext = () => syncRequestLogContext(req)

  res.set('X-Request-ID', req.requestId)

  requestLogStore.run({ requestId: req.requestId, ip }, () => next())
}
