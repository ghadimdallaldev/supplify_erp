import { createServer } from 'node:http'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ issuer: '', jwks: '' }))
vi.mock('../config/env.js', () => ({
  config: {
    NODE_ENV: 'test',
    KEYCLOAK_CLIENT_ID: 'supplify-api',
    KEYCLOAK_BASE_URL: 'http://127.0.0.1',
    KEYCLOAK_REALM: 'Supplify',
  },
}))
vi.mock('axios', () => ({
  default: {
    create: () => ({ get: async () => ({ data: { issuer: state.issuer, jwks_uri: state.jwks } }) }),
  },
}))
vi.mock('./logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
import { verifyToken, resetAuthRuntimeCachesForTests } from './auth.js'

describe('real signed Keycloak access-token verification', () => {
  let server, privateKey
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256')
    privateKey = pair.privateKey
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'audit-key', alg: 'RS256', use: 'sig' }
    server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ keys: [jwk] }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    state.issuer = `http://127.0.0.1:${server.address().port}/realms/Supplify`
    state.jwks = `http://127.0.0.1:${server.address().port}/certs`
    resetAuthRuntimeCachesForTests()
  })
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })
  const token = (claims = {}) =>
    new SignJWT({
      iss: state.issuer,
      sub: 'audit-user',
      exp: Math.floor(Date.now() / 1000) + 600,
      typ: 'Bearer',
      aud: 'account',
      azp: 'supplify-mobile',
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'audit-key' })
      .sign(privateKey)
  it('accepts current mobile and web client flows', async () => {
    expect((await verifyToken(await token())).sub).toBe('audit-user')
    expect((await verifyToken(await token({ azp: 'supplify-web', aud: 'supplify-api' }))).sub).toBe(
      'audit-user'
    )
  })
  it('rejects a signed token from a different issuer even outside production', async () => {
    await expect(
      verifyToken(await token({ iss: 'https://foreign.invalid/realms/Supplify' }))
    ).rejects.toThrow()
  })
  it('rejects unrelated authorized clients even with an API audience', async () => {
    await expect(
      verifyToken(await token({ azp: 'unrelated-client', aud: 'supplify-api' }))
    ).rejects.toThrow()
  })
  it('rejects ID/refresh tokens and missing identity/expiry/audience claims', async () => {
    for (const claims of [
      { typ: 'ID' },
      { typ: 'Refresh' },
      { sub: undefined },
      { exp: undefined },
      { azp: undefined, aud: undefined },
    ]) {
      await expect(verifyToken(await token(claims))).rejects.toThrow()
    }
  })
  it('rejects expired and tampered tokens', async () => {
    await expect(verifyToken(await token({ exp: 1 }))).rejects.toThrow()
    const parts = (await token()).split('.')
    parts[1] = Buffer.from(
      JSON.stringify({
        iss: state.issuer,
        sub: 'forged-owner',
        azp: 'supplify-mobile',
        exp: 9999999999,
      })
    ).toString('base64url')
    await expect(verifyToken(parts.join('.'))).rejects.toThrow()
  })
})
