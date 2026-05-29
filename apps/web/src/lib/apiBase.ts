import { getApiBase } from './env'

/** API origin for fetch/RTK. Re-exported from env (see resolveApiBase). */
export const API_BASE = getApiBase()

/** Build a request URL that works with a relative base in dev and an absolute base in prod. */
export function apiUrl(path: string, searchParams?: URLSearchParams): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const query = searchParams?.toString()
  const pathWithQuery = query ? `${normalizedPath}?${query}` : normalizedPath
  if (API_BASE) {
    return new URL(pathWithQuery, API_BASE).toString()
  }
  return pathWithQuery
}
