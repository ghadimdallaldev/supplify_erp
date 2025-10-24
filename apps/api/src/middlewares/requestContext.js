import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../lib/logger.js';

// Request context middleware
export function requestContext(req, res, next) {
  // Generate request ID
  req.requestId = req.headers['x-request-id'] || uuidv4();
  
  // Extract IP address (don't try to set it, just read it)
  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  
  // Create request-specific logger
  req.logger = createRequestLogger(req.requestId, ip);
  
  // Add request ID to response headers
  res.set('X-Request-ID', req.requestId);
  
  next();
}
