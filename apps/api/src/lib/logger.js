import pino from 'pino'
import { requestLogStore } from './request-log-store.js'

const NODE_ENV = process.env.NODE_ENV || 'development'
const isProduction = NODE_ENV === 'production'
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')
const LOG_FORMAT = process.env.LOG_FORMAT || (isProduction ? 'json' : 'pretty')
const usePretty = LOG_FORMAT === 'pretty' && !isProduction

export { requestLogStore } from './request-log-store.js'

/** Keys whose values are always redacted in logs (case-insensitive match on key name) */
const SENSITIVE_KEYS = new Set(
  [
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'authorization',
    'auth',
    'cookie',
    'cookies',
    'sessionid',
    'session_id',
    'oauthstate',
    'oauth_state',
    'state',
    'code',
    'access_token',
    'refresh_token',
    'id_token',
    'accesstoken',
    'refreshtoken',
    'client_secret',
    'api_key',
    'apikey',
    'redirect_uri',
  ].map((k) => k.toLowerCase())
)

const REDACTED = '[REDACTED]'

/**
 * Redact sensitive keys from an object (recursive).
 */
function redactObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Error) return redactError(obj)
  if (Array.isArray(obj)) return obj.map((item) => redactObject(item))
  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase()
    if (SENSITIVE_KEYS.has(keyLower)) {
      out[key] = REDACTED
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !(value instanceof Error)
    ) {
      out[key] = redactObject(value)
    } else {
      out[key] = value
    }
  }
  return out
}

function redactError(err) {
  if (!err) return err
  const safe = {
    message: err.message,
    name: err.name,
    code: err.code,
  }
  if (!isProduction && err.stack) safe.stack = err.stack
  if (err.response && typeof err.response === 'object') {
    safe.status = err.response.status
    if (
      err.response.data &&
      typeof err.response.data === 'object' &&
      !Buffer.isBuffer(err.response.data)
    ) {
      safe.responseData = redactObject(err.response.data)
    }
  }
  return safe
}

export function redact(obj) {
  if (obj instanceof Error) return redactError(obj)
  return redactObject(obj)
}

const PINO_REDACT_PATHS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'req.headers.authorization',
  'req.body.password',
  'req.body.token',
  'headers.authorization',
  'cookies',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
]

const pinoConfig = {
  level: LOG_LEVEL,
  base: undefined,
  redact: {
    paths: PINO_REDACT_PATHS,
    censor: REDACTED,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}

if (usePretty) {
  pinoConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  }
} else if (isProduction) {
  pinoConfig.formatters = {
    ...pinoConfig.formatters,
    log: (obj) => redactObject(obj),
  }
}

const baseLogger = pino(pinoConfig)

const LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])

function mergeBindings(first, second) {
  const ctx = requestLogStore.getStore()
  if (typeof first === 'string') {
    const base = { msg: first }
    if (second instanceof Error) {
      Object.assign(base, { err: redactError(second) })
    } else if (second && typeof second === 'object') {
      Object.assign(base, second)
    }
    return [ctx ? { ...ctx, ...base } : base, undefined]
  }
  if (first instanceof Error) {
    const err = redactError(first)
    return [ctx ? { ...ctx, err } : { err }, second]
  }
  const merged = ctx ? { ...ctx, ...first } : first
  if (second instanceof Error) {
    merged.err = redactError(second)
    return [merged, undefined]
  }
  return [merged, second]
}

function wrapPinoInstance(instance) {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      if (LOG_LEVELS.has(prop)) {
        return function logWithContext(first, second, ...rest) {
          const [obj, msg] = mergeBindings(first, second)
          if (msg !== undefined) {
            return target[prop](obj, msg, ...rest)
          }
          return target[prop](obj, ...rest)
        }
      }
      if (prop === 'child') {
        return (bindings) => wrapPinoInstance(target.child(bindings))
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Application logger — merges requestId from AsyncLocalStorage during HTTP requests */
export const logger = wrapPinoInstance(baseLogger)

/** Create a child logger with request context (requestId, ip). */
export function createRequestLogger(requestId, ip) {
  return logger.child({ requestId, ip })
}

/** Child logger tagged with a stable module name (route, service, job). */
export function createModuleLogger(module) {
  return logger.child({ module })
}

export { redactObject, redactError }
export { logEvent, summarizeQuery, logQueryDebug } from './log-helpers.js'
