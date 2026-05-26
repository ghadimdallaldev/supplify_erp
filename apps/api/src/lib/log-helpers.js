/**
 * Structured handler/domain log. Prefer `event` over free-form message strings.
 * @param {import('pino').Logger} log
 * @param {'trace'|'debug'|'info'|'warn'|'error'} level
 * @param {string} event - dotted identifier, e.g. 'supplier.list'
 * @param {Record<string, unknown>} [data]
 */
export function logEvent(log, level, event, data = {}) {
  const payload = { event, ...data }
  if (typeof log[level] === 'function') {
    log[level](payload)
  } else {
    log.info(payload)
  }
}

/**
 * Compact SQL summary for logs (no literals / params).
 */
export function summarizeQuery(sql) {
  if (!sql || typeof sql !== 'string') {
    return { op: 'QUERY', table: 'unknown', joins: 0, length: 0 }
  }
  const normalized = sql.replace(/\s+/g, ' ').trim()
  const opMatch = normalized.match(/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i)
  const op = opMatch ? opMatch[1].toUpperCase() : 'QUERY'
  const fromMatches = [...normalized.matchAll(/\bFROM\s+([a-z_][\w]*)/gi)]
  const intoMatch = normalized.match(/\bINTO\s+([a-z_][\w]*)/i)
  const table = (
    fromMatches.length ? fromMatches[fromMatches.length - 1][1] : intoMatch?.[1] || 'unknown'
  ).toLowerCase()
  const joins = (normalized.match(/\bJOIN\s+/gi) || []).length
  return { op, table, joins, length: normalized.length }
}

/**
 * Debug-level query diagnostics (enable with LOG_LEVEL=debug).
 */
export function logQueryDebug(log, event, sql, { paramCount = 0, ...extra } = {}) {
  logEvent(log, 'debug', event, {
    query: summarizeQuery(sql),
    paramCount,
    ...extra,
  })
}
