/**
 * Post-login return path helpers.
 *
 * `returnTo` travels as a query param on /login and must be a same-origin relative
 * path that starts with a single "/". Anything else (absolute URLs, protocol-relative
 * `//host`, backslash tricks, control characters) is rejected to avoid open redirects.
 */
const RETURN_TO_BASE = 'http://returnto.invalid'

export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f]/.test(value)) return null
  try {
    if (new URL(value, RETURN_TO_BASE).origin !== RETURN_TO_BASE) return null
  } catch {
    return null
  }
  // Never bounce back to the login screen itself.
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return null
  return value
}

/** `/login` URL carrying the (sanitized) page the user was trying to reach. */
export function loginPathWithReturnTo(returnTo: string | null | undefined): string {
  const safe = sanitizeReturnTo(returnTo)
  return safe ? `/login?returnTo=${encodeURIComponent(safe)}` : '/login'
}
