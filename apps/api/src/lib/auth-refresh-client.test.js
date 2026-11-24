import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression guard: mobile refresh tokens are issued to the public `supplify-mobile` client.
// Keycloak only refreshes a token for the client it was issued to, so refreshing it as the API's
// confidential client failed with invalid_grant and signed mobile users out at the first
// access-token expiry (~20 min).

const post = vi.fn()
const get = vi.fn()

vi.mock('axios', () => ({
  default: { create: () => ({ post, get }) },
}))
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('../config/env.js', () => ({
  config: {
    APP_ENV: 'dev',
    NODE_ENV: 'test',
    KEYCLOAK_BASE_URL: 'http://localhost:8080',
    KEYCLOAK_PUBLIC_URL: 'http://localhost:8080',
    KEYCLOAK_REALM: 'Supplify',
    KEYCLOAK_CLIENT_ID: 'supplify-api',
    KEYCLOAK_CLIENT_SECRET: 'api-secret',
    KEYCLOAK_MOBILE_CLIENT_ID: 'supplify-mobile',
  },
}))

const { refreshAccessTokenDetailed } = await import('./auth.js')

function sentParams() {
  const body = post.mock.calls.at(-1)[1]
  return Object.fromEntries(new URLSearchParams(body.toString()))
}

describe('refreshAccessTokenDetailed client selection', () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({ data: { access_token: 'a', refresh_token: 'r' } })
    get.mockReset().mockResolvedValue({
      data: {
        token_endpoint: 'http://localhost:8080/realms/Supplify/protocol/openid-connect/token',
        issuer: 'http://localhost:8080/realms/Supplify',
        jwks_uri: 'http://localhost:8080/realms/Supplify/protocol/openid-connect/certs',
      },
    })
  })

  it('refreshes web tokens as the confidential API client', async () => {
    const result = await refreshAccessTokenDetailed('web-refresh')
    expect(result.ok).toBe(true)
    expect(sentParams()).toMatchObject({
      grant_type: 'refresh_token',
      client_id: 'supplify-api',
      client_secret: 'api-secret',
      refresh_token: 'web-refresh',
    })
  })

  it('refreshes mobile tokens as the public mobile client without a secret', async () => {
    const result = await refreshAccessTokenDetailed('mobile-refresh', {
      clientId: 'supplify-mobile',
    })
    expect(result.ok).toBe(true)
    const params = sentParams()
    expect(params).toMatchObject({
      grant_type: 'refresh_token',
      client_id: 'supplify-mobile',
      refresh_token: 'mobile-refresh',
    })
    expect(params).not.toHaveProperty('client_secret')
  })
})
