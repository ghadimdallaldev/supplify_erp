import { z } from 'zod'
import { localizedError, resolveRequestLocale } from '../i18n/index.js'
import { logger } from './logger.js'

/**
 * A catalog rule failure: shelves, platform categories and category requests.
 * `name` is the API error name, `code` the `catalog.errors.<code>` message key (and the
 * `error.code` clients branch on), `statusCode` the HTTP status.
 */
export class CatalogError extends Error {
  /**
   * @param {string} name e.g. VALIDATION_ERROR, SHELF_IN_USE
   * @param {string} code message key under catalog.errors
   * @param {number} statusCode
   * @param {unknown} [details]
   */
  constructor(name, code, statusCode, details = undefined) {
    super(code)
    this.name = name
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export const catalogValidation = (code, details) =>
  new CatalogError('VALIDATION_ERROR', code, 400, details)
export const catalogNotFound = (code) => new CatalogError('NOT_FOUND', code, 404)

/** Postgres unique violation on the named index. */
export function isUniqueViolation(error, constraint) {
  return error?.code === '23505' && (!constraint || error.constraint === constraint)
}

/**
 * Send `{ ok: false, error: { name, code, message, details? } }` for a CatalogError or ZodError,
 * or a localized 500 for anything else.
 */
export function sendCatalogError(req, res, error, logLabel = 'Catalog request failed') {
  const locale = resolveRequestLocale(req)
  let status
  let payload
  if (error instanceof CatalogError) {
    status = error.statusCode
    payload = localizedError(locale, error.name, `errors.${error.code}`, {}, 'catalog')
    if (error.details !== undefined) payload.details = error.details
  } else if (error instanceof z.ZodError) {
    status = 400
    payload = {
      ...localizedError(locale, 'VALIDATION_ERROR', 'errors.invalidInput', {}, 'catalog'),
      details: error.errors,
    }
  } else {
    status = 500
    logger.error(logLabel, { error: error?.message, stack: error?.stack })
    payload = localizedError(locale, 'INTERNAL_ERROR', 'errors.internal', {}, 'catalog')
  }
  return res
    .status(status)
    .json({ ok: false, data: null, error: payload, requestId: req.requestId })
}
