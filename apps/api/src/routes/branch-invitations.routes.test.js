import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSupplierUser, clearAllMocks } from '../test/helpers.js'

const createBranchInvitation = vi.fn()
const listBranchInvitations = vi.fn()
const revokeBranchInvitation = vi.fn()
const regenerateBranchInvitation = vi.fn()
const assertSupplierInOrg = vi.fn()
const validateBranchRoleForSupplier = vi.fn()

vi.mock('../lib/branch-invitations.js', () => ({
  createBranchInvitation: (...args) => createBranchInvitation(...args),
  listBranchInvitations: (...args) => listBranchInvitations(...args),
  revokeBranchInvitation: (...args) => revokeBranchInvitation(...args),
  regenerateBranchInvitation: (...args) => regenerateBranchInvitation(...args),
  assertSupplierInOrg: (...args) => assertSupplierInOrg(...args),
  validateBranchRoleForSupplier: (...args) => validateBranchRoleForSupplier(...args),
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ id: 'supplier-main' }] }),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
}))

vi.mock('../lib/subscription.js', () => ({
  requireFeature: () => (req, res, next) => next(),
}))

vi.mock('../lib/supplier-org.js', () => ({
  getUserOrgMembership: vi.fn().mockResolvedValue({
    organization_id: 'org-1',
    role_name: 'Org Owner',
  }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import branchInvitationsRoutes from './branch-invitations.routes.js'

describe('branch-invitations.routes', () => {
  let app

  beforeEach(() => {
    clearAllMocks()
    createBranchInvitation.mockReset()
    listBranchInvitations.mockReset()
    revokeBranchInvitation.mockReset()
    regenerateBranchInvitation.mockReset()
    assertSupplierInOrg.mockResolvedValue(true)
    validateBranchRoleForSupplier.mockResolvedValue(true)

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test'
      req.userData = { ...mockSupplierUser, id: 'user-1' }
      next()
    })
    app.use('/api/org/invitations', branchInvitationsRoutes)
  })

  it('POST / creates invitation and returns invite_url', async () => {
    createBranchInvitation.mockResolvedValue({
      invitation: { id: 'inv-1' },
      invite_url: 'http://localhost:5173/invite/branch?token=abc',
      expires_at: new Date().toISOString(),
    })
    const res = await request(app)
      .post('/api/org/invitations')
      .send({
        supplier_id: 'branch-1',
        invited_name: 'Alex',
        invited_email: 'alex@example.com',
        role_id: 'role-1',
      })
      .expect(201)
    expect(res.body.data.invitation_id).toBe('inv-1')
    expect(res.body.data.invite_url).toContain('/invite/branch?token=')
  })

  it('GET / lists invitations', async () => {
    listBranchInvitations.mockResolvedValue([{ id: 'inv-1', status: 'pending' }])
    const res = await request(app).get('/api/org/invitations').expect(200)
    expect(res.body.data.invitations).toHaveLength(1)
  })

  it('DELETE /:id revokes invitation', async () => {
    revokeBranchInvitation.mockResolvedValue({ id: 'inv-1' })
    await request(app).delete('/api/org/invitations/inv-1').expect(200)
    expect(revokeBranchInvitation).toHaveBeenCalledWith('inv-1', 'org-1')
  })

  it('POST /:id/regenerate returns new invite_url', async () => {
    regenerateBranchInvitation.mockResolvedValue({
      invitation: { id: 'inv-1' },
      invite_url: 'http://localhost:5173/invite/branch?token=new',
      expires_at: new Date().toISOString(),
    })
    const res = await request(app).post('/api/org/invitations/inv-1/regenerate').expect(200)
    expect(res.body.data.invite_url).toContain('token=new')
  })
})
