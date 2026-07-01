import { config } from '../config/env.js'

/**
 * Build an absolute browser URL for email CTAs and invite links.
 * Leaves http(s) URLs unchanged; prefixes app paths with WEB_ORIGIN.
 */
export function buildAppUrl(path) {
  if (!path || typeof path !== 'string') return null
  const trimmed = path.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const base = (config.WEB_ORIGIN || config.PUBLIC_FRONTEND_URL || 'http://localhost:5173').replace(
    /\/$/,
    ''
  )
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `${base}${normalized}`
}
