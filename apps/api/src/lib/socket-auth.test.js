import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./auth.js', () => ({
  verifyToken: vi.fn(),
  refreshAccessToken: vi.fn(),
  refreshAccessTokenSingleFlight: vi.fn(),
  getAccessTokenExpiresAtMs: vi.fn().mockReturnValue(Date.now() + 1_200_000),
}))

import { verifyToken, refreshAccessTokenSingleFlight } from './auth.js'
import { parseCookieHeader, resolvePayloadFromCookieHeader } from './socket-auth.js'

describe('socket-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses cookie header with decodeURIComponent', () => {
    expect(parseCookieHeader('access_token=abc%2Bdef; refresh_token=xyz')).toEqual({
      access_token: 'abc+def',
      refresh_token: 'xyz',
    })
  })

  it('returns payload for valid access token', async () => {
    vi.mocked(verifyToken).mockResolvedValueOnce({ sub: 'user-sub' })

    const result = await resolvePayloadFromCookieHeader('access_token=valid.jwt')

    expect(result.payload.sub).toBe('user-sub')
    expect(result.newTokens).toBeNull()
    expect(refreshAccessTokenSingleFlight).not.toHaveBeenCalled()
  })

  it('refreshes expired access token using refresh cookie', async () => {
    const expired = new Error('Token expired')
    expired.name = 'JWTExpired'
    expired.code = 'ERR_JWT_EXPIRED'

    vi.mocked(verifyToken).mockRejectedValueOnce(expired).mockResolvedValueOnce({ sub: 'user-sub' })
    vi.mocked(refreshAccessTokenSingleFlight).mockResolvedValueOnce({
      ok: true,
      tokens: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      },
    })

    const result = await resolvePayloadFromCookieHeader(
      'access_token=expired.jwt; refresh_token=refresh.jwt'
    )

    expect(refreshAccessTokenSingleFlight).toHaveBeenCalledWith('refresh.jwt')
    expect(result.payload.sub).toBe('user-sub')
    expect(result.newTokens?.access_token).toBe('new-access')
  })
})
