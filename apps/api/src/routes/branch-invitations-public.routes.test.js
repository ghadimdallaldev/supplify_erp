import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getInvitationByToken = vi.fn()
const evaluateInvitationPublicState = vi.fn()
const acceptBranchInvitation = vi.fn()

vi.mock('../lib/branch-invitations.js', () => ({
  getInvitationByToken: (...args) => getInvitationByToken(...args),
  evaluateInvitationPublicState: (...args) => evaluateInvitationPublicState(...args),
  acceptBranchInvitation: (...args) => acceptBranchInvitation(...args),
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ name: 'North Branch' }] }),
}))

const setAuthCookies = vi.fn((res) => {
  res.cookie('access_token', 'access', { httpOnly: true })
  res.cookie('refresh_token', 'refresh', { httpOnly: true })
})

vi.mock('../lib/rbac.js', () => ({
  optionalAuth: (req, res, next) => next(),
  setAuthCookies: (...args) => setAuthCookies(...args),
}))

vi.mock('../lib/invite-login.js', () => ({
  completeInviteAcceptSession: vi.fn(async (res) => {
    res.cookie('access_token', 'access', { httpOnly: true })
    res.cookie('refresh_token', 'refresh', { httpOnly: true })
    return {
      user: { email: 'alex@example.com', displayName: 'Alex' },
      needsManualLogin: false,
    }
  }),
}))

vi.mock('../lib/legal-acceptance.js', () => ({
  recordInviteLegalAcceptances: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/tenant-switch.js', () => ({
  createActiveTenantToken: vi.fn().mockResolvedValue('tenant-token'),
  getActiveTenantCookieName: () => 'active_tenant_token',
}))

vi.mock('../config/env.js', () => ({
  config: { NODE_ENV: 'test' },
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import publicRoutes from './branch-invitations-public.routes.js'

const legalAcceptance = {
  packVersion: '2026-05-28',
  acceptedDocuments: ['terms_and_conditions', 'privacy_policy', 'supplier_agreement'],
  electronicSignatureAttestation: true,
}

describe('branch-invitations-public.routes', () => {
  let app

  beforeEach(() => {
    getInvitationByToken.mockReset()
    evaluateInvitationPublicState.mockReset()
    acceptBranchInvitation.mockReset()

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test'
      next()
    })
    app.use('/api/public/invitations', publicRoutes)
  })

  it('GET /branch returns public branch info without internal ids', async () => {
    getInvitationByToken.mockResolvedValue({ token: 'tok' })
    evaluateInvitationPublicState.mockReturnValue({
      valid: true,
      branch_name: 'North',
      org_name: 'Acme',
      invited_name: 'Alex',
      role_name: 'Manager',
      expires_at: new Date().toISOString(),
    })
    const res = await request(app).get('/api/public/invitations/branch?token=tok').expect(200)
    expect(res.body.data.valid).toBe(true)
    expect(res.body.data.branch_name).toBe('North')
    expect(res.body.data.supplier_id).toBeUndefined()
    expect(res.body.data.organization_id).toBeUndefined()
  })

  it('POST /branch/accept returns session for new user', async () => {
    acceptBranchInvitation.mockResolvedValue({
      userId: 'user-2',
      supplierId: 'branch-1',
      email: 'alex@example.com',
      needsLogin: true,
      password: 'password123',
    })
    const res = await request(app)
      .post('/api/public/invitations/branch/accept')
      .send({ token: 'tok', full_name: 'Alex', password: 'password123', legalAcceptance })
      .expect(200)
    expect(res.body.data.activeSupplierId).toBe('branch-1')
    expect(res.headers['set-cookie']?.join(';')).toContain('access_token')
  })

  it('POST /branch/accept rejects expired token', async () => {
    const err = new Error('Invitation expired')
    err.code = 'expired'
    acceptBranchInvitation.mockRejectedValue(err)
    await request(app)
      .post('/api/public/invitations/branch/accept')
      .send({ token: 'tok', full_name: 'Alex', password: 'password123', legalAcceptance })
      .expect(410)
  })
})
