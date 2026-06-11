/** Extract a user-facing message from RTK Query / fetchBaseQuery errors. */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (typeof error !== 'object') return fallback

  const e = error as {
    message?: string
    error?: string
    status?: string | number
    data?: unknown
  }

  if (typeof e.message === 'string' && e.message.trim()) return e.message
  if (typeof e.error === 'string' && e.error.trim()) return e.error

  const data = e.data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object') {
    const d = data as { message?: string; name?: string; error?: { message?: string } }
    if (typeof d.message === 'string' && d.message.trim()) return d.message
    if (typeof d.error?.message === 'string' && d.error.message.trim()) return d.error.message
    if (d.name === 'TIME_ENTRY_OPEN_EXISTS') {
      return 'This staff member is already clocked in. Clock them out first.'
    }
    if (d.name === 'STAFF_PORTAL_FORBIDDEN') {
      return 'Staff portal accounts cannot use restaurant admin staff tools.'
    }
  }

  if (e.status === 'CUSTOM_ERROR') {
    return 'This action is not available on your current plan or permissions.'
  }
  if (e.status === 403) return 'You do not have permission to perform this action.'
  if (e.status === 401) return 'Please sign in again.'
  if (e.status === 404) return 'The requested record was not found.'

  return fallback
}

/** RTK baseQuery unwraps `{ ok, data: rows }` to `rows` for array endpoints. */
export function normalizeListResponse<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[]
  if (response && typeof response === 'object') {
    const data = (response as { data?: unknown }).data
    if (Array.isArray(data)) return data as T[]
  }
  return []
}

/** RTK baseQuery unwraps `{ ok, data: payload }` to `payload` for object endpoints. */
export function normalizeObjectResponse<T>(response: unknown): T {
  if (response && typeof response === 'object' && 'data' in response) {
    const nested = (response as { data?: T }).data
    if (nested !== undefined) return nested
  }
  return response as T
}
