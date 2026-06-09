/** Format a metric that may be absent — never fake zero for missing backend data. */
export function formatOptionalCount(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'Not available'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Not available'
  return String(n)
}

export function parseOptionalCount(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = parseInt(String(value), 10)
  return Number.isFinite(n) ? n : null
}
