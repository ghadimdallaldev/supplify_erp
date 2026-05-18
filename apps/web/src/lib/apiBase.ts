/** API origin for fetch/RTK. Empty string uses Vite dev proxy (relative paths). */
export const API_BASE =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : 'http://localhost:4000')

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
