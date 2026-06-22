import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { query } from '../lib/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_LOCALE = 'en'
const SUPPORTED_LOCALES = new Set(['en', 'ar'])

function loadJson(locale, namespace) {
  const filePath = join(__dirname, 'locales', locale, `${namespace}.json`)
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

const TRANSLATIONS = {
  en: {
    billing: loadJson('en', 'billing'),
    consumer: loadJson('en', 'consumer'),
    emails: loadJson('en', 'emails'),
    notifications: loadJson('en', 'notifications'),
    orders: loadJson('en', 'orders'),
    prices: loadJson('en', 'prices'),
    receiving: loadJson('en', 'receiving'),
  },
  ar: {
    billing: loadJson('ar', 'billing'),
    consumer: loadJson('ar', 'consumer'),
    emails: loadJson('ar', 'emails'),
    notifications: loadJson('ar', 'notifications'),
    orders: loadJson('ar', 'orders'),
    prices: loadJson('ar', 'prices'),
    receiving: loadJson('ar', 'receiving'),
  },
}

function getNested(obj, path) {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, part) => acc?.[part], obj)
}

function interpolate(str, params = {}) {
  if (str == null) return ''
  return String(str).replace(/\{\{(\w+)\}\}/g, (_, key) =>
    params[key] != null ? String(params[key]) : `{{${key}}}`
  )
}

/**
 * Resolve a supported locale from a string, user object, or preferred_locale field.
 */
export function resolveLocale(source) {
  if (!source) return DEFAULT_LOCALE
  if (typeof source === 'string') {
    const base = source.split('-')[0].toLowerCase()
    return SUPPORTED_LOCALES.has(base) ? base : DEFAULT_LOCALE
  }
  const raw = source.preferred_locale ?? source.preferredLocale ?? source.locale
  if (raw) return resolveLocale(raw)
  return DEFAULT_LOCALE
}

export function getLanguageDirection(locale) {
  return resolveLocale(locale) === 'ar' ? 'rtl' : 'ltr'
}

/** @param {string | undefined | null} locale */
export function toIntlLocale(locale) {
  return resolveLocale(locale) === 'ar' ? 'ar' : 'en-US'
}

/** @param {import('express').Request} req */
export function resolveRequestLocale(req) {
  const queryLocale = req?.query?.locale
  if (queryLocale) return resolveLocale(String(queryLocale))

  const headerLocale = req?.headers?.['x-locale']
  if (headerLocale) return resolveLocale(String(headerLocale))

  const acceptLanguage = req?.headers?.['accept-language']
  if (acceptLanguage) {
    const preferred = String(acceptLanguage).split(',')[0]?.trim()
    if (preferred) return resolveLocale(preferred)
  }

  return DEFAULT_LOCALE
}

/**
 * Build a localized API error payload.
 * @param {string | undefined | null} locale
 * @param {string} name
 * @param {string} messageKey dotted key such as `errors.restaurantNotFound` or full `receiving.errors.restaurantNotFound`
 * @param {Record<string, string | number>} [vars]
 * @param {string} [namespace]
 */
export function localizedError(locale, name, messageKey, vars = {}, namespace) {
  const key = messageKey.includes('.') && !namespace ? messageKey : `${namespace}.${messageKey}`
  return {
    name,
    code: messageKey.split('.').pop(),
    message: t(key, locale, vars),
  }
}

/**
 * Translate a dotted key such as `emails.auth.welcome.subject` or `notifications.order.placed.title`.
 */
export function t(key, locale = DEFAULT_LOCALE, params = {}) {
  const lng = resolveLocale(locale)
  const [namespace, ...parts] = key.split('.')
  const path = parts.join('.')
  const bundle = TRANSLATIONS[lng]?.[namespace] ?? TRANSLATIONS[DEFAULT_LOCALE][namespace]
  const fallback = TRANSLATIONS[DEFAULT_LOCALE][namespace]
  const value = getNested(bundle, path) ?? getNested(fallback, path) ?? key
  return interpolate(value, params)
}

let preferredLocaleLookupEnabled = null

async function fetchUserLocales(userIds) {
  const locales = new Map(userIds.map((id) => [id, DEFAULT_LOCALE]))
  if (preferredLocaleLookupEnabled === false || !userIds.length) return locales
  if (process.env.VITEST) return locales

  try {
    const { rows } = await query(
      `SELECT id, preferred_locale FROM app_user WHERE id = ANY($1::uuid[])`,
      [userIds]
    )
    preferredLocaleLookupEnabled = true
    for (const row of rows) {
      locales.set(row.id, resolveLocale(row.preferred_locale))
    }
    return locales
  } catch (error) {
    if (
      error?.code === '42703' ||
      String(error?.message || '')
        .toLowerCase()
        .includes('preferred_locale')
    ) {
      preferredLocaleLookupEnabled = false
    }
    return locales
  }
}

export { fetchUserLocales }

/**
 * Resolve locale for a user id using preferred_locale when the column exists.
 */
export async function resolveUserLocale(userId, fallback = DEFAULT_LOCALE) {
  if (!userId) return resolveLocale(fallback)
  const locales = await fetchUserLocales([userId])
  return locales.get(userId) || resolveLocale(fallback)
}
