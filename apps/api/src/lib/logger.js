import pino from 'pino';

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'development' ? 'debug' : 'info');
const isDevelopment = NODE_ENV === 'development';

/** Keys whose values are always redacted in logs (case-insensitive match on key name) */
const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'pwd', 'secret', 'token', 'authorization', 'auth',
  'cookie', 'cookies', 'sessionid', 'session_id', 'oauthstate', 'oauth_state',
  'state', 'code', 'access_token', 'refresh_token', 'id_token',
  'client_secret', 'api_key', 'apikey', 'authorization_code',
  'body', 'params', 'query', // may contain PII; redact in production
  'message', 'text', 'content', // notification body
  'phone', 'email', // redact in production or hash
  'redirect_uri', // can contain tokens in fragment
].map((k) => k.toLowerCase()));

const REDACTED = '[REDACTED]';

/**
 * Redact sensitive keys from an object (one level; does not redact nested req.body.password).
 * Used for structured log payloads so we never log tokens, passwords, or full PII in production.
 */
function redactObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(keyLower)) {
      out[key] = REDACTED;
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof Error)) {
      out[key] = redactObject(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Redact error for logging: message and code are safe; stack only in development.
 * Avoid logging error.response.data from axios (may contain tokens).
 */
function redactError(err) {
  if (!err) return err;
  const safe = {
    message: err.message,
    name: err.name,
    code: err.code,
  };
  if (isDevelopment && err.stack) safe.stack = err.stack;
  if (err.response && typeof err.response === 'object') {
    safe.status = err.response.status;
    if (err.response.data && typeof err.response.data === 'object' && !Buffer.isBuffer(err.response.data)) {
      safe.responseData = redactObject(err.response.data);
    }
  }
  return safe;
}

export function redact(obj) {
  if (obj instanceof Error) return redactError(obj);
  return redactObject(obj);
}

const pinoConfig = {
  level: LOG_LEVEL,
  base: undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

if (isDevelopment) {
  pinoConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
} else {
  pinoConfig.formatters = {
    ...pinoConfig.formatters,
    log: (obj) => {
      const redacted = redactObject(obj);
      return redacted;
    },
  };
}

export const logger = pino(pinoConfig);

/** Create a child logger with request context (requestId, ip). Use for request-scoped logs. */
export function createRequestLogger(requestId, ip) {
  return logger.child({ requestId, ip });
}

export { redactObject, redactError };
