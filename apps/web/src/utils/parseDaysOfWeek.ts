const DAY_NAME = /^[A-Z][A-Z_]*$/

/**
 * Normalize quick_list.days_of_week from API (JSON array, legacy JSON string, or single day).
 */
export function parseDaysOfWeek(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.filter((d): d is string => typeof d === 'string' && d.length > 0)
  }
  if (typeof value !== 'string') return []

  const trimmed = value.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter((d): d is string => typeof d === 'string' && d.length > 0)
      }
      if (typeof parsed === 'string' && parsed.length > 0) return [parsed]
    } catch {
      return []
    }
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter((d) => d.length > 0)
  }

  if (DAY_NAME.test(trimmed)) return [trimmed]

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.filter((d): d is string => typeof d === 'string' && d.length > 0)
    }
    if (typeof parsed === 'string' && parsed.length > 0) return [parsed]
  } catch {
    /* legacy plain day name */
  }

  return trimmed.length > 0 ? [trimmed] : []
}

export function formatDaysOfWeekLabel(days: string[]): string {
  return days.map((d) => d.charAt(0) + d.slice(1).toLowerCase()).join(', ')
}
