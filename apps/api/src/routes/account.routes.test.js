import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDeletionStatus = vi.fn()
const deletePersonalAccount = vi.fn()
const transferOrganizationOwnership = vi.fn()
const closeOrganization = vi.fn()

vi.mock('../services/account-deletion.service.js', () => ({
  OWNER_BLOCKER_CODE: 'ORG_OWNER_MUST_TRANSFER_OR_CLOSE',
  getDeletionStatus: (...args) => getDeletionStatus(...args),
  deletePersonalAccount: (...args) => deletePersonalAccount(...args),
  transferOrganizationOwnership: (...args) => transferOrganizationOwnership(...args),
  closeOrganization: (...args) => closeOrganization(...args),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, _res, next) => {
    req.userData = { id: 'user-1', email: 'a@b.com', role: 'CONSUMER' }
    next()
  },
}))

describe('account.routes', () => {
  let app

  beforeEach(async () => {
    getDeletionStatus.mockReset()
    deletePersonalAccount.mockReset()
    transferOrganizationOwnership.mockReset()
    closeOrganization.mockReset()

    const { accountRoutes } = await import('./account.routes.js')
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.requestId = 'test-req'
      next()
    })
    app.use('/api/account', accountRoutes)
  })

  it('GET /deletion-status returns status payload', async () => {
    getDeletionStatus.mockResolvedValue({
      canDelete: true,
      blockers: [],
      retention: { deleted: [], anonymized: [], retained: [] },
    })
    const res = await request(app).get('/api/account/deletion-status').expect(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.canDelete).toBe(true)
    expect(getDeletionStatus).toHaveBeenCalledWith('user-1')
  })

  it('DELETE / returns 409 with owner blocker code', async () => {
    const err = Object.assign(
      new Error('Transfer organization ownership or close the organization'),
      {
        name: 'ConflictError',
        code: 'ORG_OWNER_MUST_TRANSFER_OR_CLOSE',
        details: { blockers: [{ organizationId: 'org-1' }] },
      }
    )
    deletePersonalAccount.mockRejectedValue(err)
    const res = await request(app)
      .delete('/api/account')
      .send({ confirmation: 'DELETE' })
      .expect(409)
    expect(res.body.error.name).toBe('ORG_OWNER_MUST_TRANSFER_OR_CLOSE')
    expect(res.body.error.details.blockers).toHaveLength(1)
  })

  it('DELETE / succeeds for eligible user', async () => {
    deletePersonalAccount.mockResolvedValue({ deleted: true, alreadyDeleted: false })
    const res = await request(app)
      .delete('/api/account')
      .send({ confirmation: 'DELETE' })
      .expect(200)
    expect(res.body.data.deleted).toBe(true)
  })

  it('POST /close-organization requires confirmation name', async () => {
    closeOrganization.mockResolvedValue({ closed: true })
    await request(app)
      .post('/api/account/close-organization')
      .send({
        organizationId: '11111111-1111-1111-1111-111111111111',
        workspaceType: 'SUPPLIER',
        confirmationName: 'Acme Foods',
      })
      .expect(200)
    expect(closeOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterId: 'user-1',
        confirmationName: 'Acme Foods',
      })
    )
  })
})
