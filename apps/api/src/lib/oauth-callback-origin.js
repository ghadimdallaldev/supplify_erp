/**
 * Origin the OAuth callback must live on (first-party on the web host so auth cookies are not
 * third-party). Forwarded headers are client-controllable, so a forwarded host is only honoured
 * when it matches an origin we already trust (WEB_ORIGINS / public API URL); otherwise we fall
 * back to the configured web origin. Pure so it can be unit-tested.
 *
 * @param {object} p
 * @param {string} [p.configured] OAUTH_CALLBACK_BASE_URL
 * @param {string} [p.forwardedHost] X-Forwarded-Host
 * @param {string} [p.forwardedProto] X-Forwarded-Proto (ignored: scheme comes from the allowlist)
 * @param {string} [p.host] request Host header
 * @param {string} [p.protocol] request protocol
 * @param {string[]} p.allowedOrigins trusted origins
 * @param {string} p.fallbackOrigin configured web origin used when nothing is trusted
 * @param {boolean} [p.allowUnlistedHost] local dev only: trust the request Host as before
 */
export function resolveCallbackOrigin({
  configured,
  forwardedHost,
  host,
  protocol,
  allowedOrigins,
  fallbackOrigin,
  allowUnlistedHost = false,
}) {
  if (configured) return configured.replace(/\/$/, '')

  const trusted = new Map()
  for (const origin of allowedOrigins || []) {
    try {
      const url = new URL(origin)
      if (url.protocol === 'http:' || url.protocol === 'https:') trusted.set(url.host, url.origin)
    } catch {
      // ignore malformed entries
    }
  }

  const forwarded = String(forwardedHost || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (forwarded && trusted.has(forwarded)) return trusted.get(forwarded)

  const requestHost = String(host || '')
    .trim()
    .toLowerCase()
  if (requestHost && trusted.has(requestHost)) return trusted.get(requestHost)
  if (allowUnlistedHost && requestHost) return `${protocol}://${requestHost}`

  return String(fallbackOrigin || '').replace(/\/$/, '')
}
