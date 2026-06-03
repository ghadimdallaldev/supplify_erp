import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as jose from 'jose'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../config/env.js', () => ({
  config: {
    IMPERSONATION_SECRET: 'test-secret-key-for-impersonation-tests',
    IMPERSONATION_MAX_DURATION_MINUTES: 60,
    NODE_ENV: 'test',
  },
}))

const { createImpersonationToken, verifyImpersonationToken, getEffectiveTenant } = await import(
  './impersonation.js'
)
const { query } = await import('./db.js')

describe('impersonation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates and verifies token with sessionId', async () => {
    const token = await createImpersonationToken({
      adminUserId: 'admin-1',
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      tenantName: 'Test Restaurant',
      sessionId: 'sess-abc',
    })
    const payload = await verifyImpersonationToken(token)
    expect(payload).toMatchObject({
      adminUserId: 'admin-1',
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      tenantName: 'Test Restaurant',
      sessionId: 'sess-abc',
    })
  })

  it('getEffectiveTenant returns tenant only for matching admin', () => {
    const req = {
      userData: { id: 'admin-1', role: 'ADMIN' },
      impersonationContext: {
        adminUserId: 'admin-1',
        tenantId: 't1',
        tenantType: 'SUPPLIER',
        tenantName: 'S',
        sessionId: 's1',
      },
    }
    expect(getEffectiveTenant(req)).toEqual({
      tenantId: 't1',
      tenantType: 'SUPPLIER',
      tenantName: 'S',
      sessionId: 's1',
      viewAsRoleId: null,
    })

    const otherAdmin = { ...req, userData: { id: 'admin-2', role: 'ADMIN' } }
    expect(getEffectiveTenant(otherAdmin)).toBeNull()
  })

  it('rejects expired token', async () => {
    const secret = new TextEncoder().encode('test-secret-key-for-impersonation-tests')
    const token = await new jose.SignJWT({
      adminUserId: 'a',
      tenantId: 't',
      tenantType: 'RESTAURANT',
      tenantName: 'n',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secret)

    const payload = await verifyImpersonationToken(token)
    expect(payload).toBeNull()
  })
})

describe('impersonationCanAccessBranch', () => {
  it('allows same tenant id', async () => {
    const { impersonationCanAccessBranch } = await import('./impersonation.js')
    const ok = await impersonationCanAccessBranch('same-id', 'RESTAURANT', 'same-id', 'RESTAURANT')
    expect(ok).toBe(true)
    expect(query).not.toHaveBeenCalled()
  })
})
