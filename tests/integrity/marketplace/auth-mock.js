/**
 * Test identities for the marketplace harness. A token is JWT-shaped so the API's own
 * expiry parsing (getAccessTokenExpiresAtMs) works for HTTP and socket handshakes:
 *   test.<base64url({ sub, exp })>.sig
 * Only tokens with the `test.` prefix are accepted by the mock; anything else goes to the
 * real verifier (which fails without Keycloak), so the harness never weakens real tokens.
 */
export function makeTestToken(sub, { ttlSeconds = 3600 } = {}) {
  const payload = Buffer.from(
    JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + ttlSeconds })
  ).toString('base64url')
  return `test.${payload}.sig`
}

export function decodeTestToken(token) {
  if (typeof token !== 'string' || !token.startsWith('test.')) return null
  const [, payload] = token.split('.')
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof parsed.sub === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function withTestAuth(original) {
  return {
    ...original,
    async verifyToken(token) {
      const decoded = decodeTestToken(token)
      if (!decoded) throw new Error('Invalid token')
      return { sub: decoded.sub, exp: decoded.exp, email_verified: true }
    },
  }
}
