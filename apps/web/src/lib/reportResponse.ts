/** RTK baseQuery unwraps `{ ok, data: rows }` to `rows`; normalize for report hooks. */
export function normalizeReportResponse(response: unknown): {
  data: Array<Record<string, unknown>>
  meta?: Record<string, unknown>
} {
  if (Array.isArray(response)) {
    return { data: response as Array<Record<string, unknown>> }
  }
  if (response && typeof response === 'object') {
    const o = response as { data?: unknown; meta?: unknown }
    if (Array.isArray(o.data)) {
      return {
        data: o.data as Array<Record<string, unknown>>,
        meta: o.meta as Record<string, unknown> | undefined,
      }
    }
  }
  return { data: [] }
}

export function reportErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Could not load this report.'
  const e = error as { data?: { message?: string; name?: string }; status?: string | number }
  if (e.data && typeof e.data === 'object' && typeof e.data.message === 'string') {
    return e.data.message
  }
  if (e.status === 'CUSTOM_ERROR') return 'This report is not available on your plan or account.'
  if (e.status === 403) return 'You do not have permission to view this report.'
  if (e.status === 401) return 'Please sign in again to view reports.'
  return 'Could not load this report.'
}
