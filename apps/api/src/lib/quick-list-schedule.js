/**
 * Normalize quick_list.days_of_week for API responses (handles legacy seed data).
 * @param {unknown} value
 * @returns {string[] | null}
 */
export function normalizeDaysOfWeek(value) {
  if (value == null) return null

  if (Array.isArray(value)) {
    const days = value.filter((d) => typeof d === 'string' && d.length > 0)
    return days.length ? days : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          const days = parsed.filter((d) => typeof d === 'string' && d.length > 0)
          return days.length ? days : null
        }
        if (typeof parsed === 'string' && parsed.length > 0) return [parsed]
      } catch {
        return null
      }
    }
    if (/^[A-Z][A-Z_]*$/.test(trimmed)) return [trimmed]
    return null
  }

  return null
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapQuickListRow(row) {
  if (!row || typeof row !== 'object') return row
  return {
    ...row,
    days_of_week: normalizeDaysOfWeek(row.days_of_week),
  }
}
