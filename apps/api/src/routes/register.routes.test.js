import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const userNeedsTenantSetup = vi.fn()
const completeTenantRegistration = vi.fn()

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => {
    req.userData = {
      id: 'user-1',
      email: 'new@restaurant.com',
      role: 'PENDING',
      keycloak_sub: 'kc-sub',
    }
    next()
  },
}))

vi.mock('../lib/register-account.js', () => ({
  userNeedsTenantSetup,
  completeTenantRegistration,
}))

vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}))

describe('register.routes', () => {
  let app

  beforeEach(async () => {
    userNeedsTenantSetup.mockReset()
    completeTenantRegistration.mockReset()

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'req-reg'
      next()
    })
    const { registerRoutes } = await import('./register.routes.js')
    app.use('/api/register', registerRoutes)
  })

  it('GET /status returns needsSetup flag', async () => {
    userNeedsTenantSetup.mockResolvedValue(true)

    const res = await request(app).get('/api/register/status').expect(200)

    expect(res.body.data.needsSetup).toBe(true)
  })

  it('POST /complete creates tenant and returns 201', async () => {
    userNeedsTenantSetup.mockResolvedValue(true)
    completeTenantRegistration.mockResolvedValue({
      tenant: { id: 'rest-1', name: 'My Rest' },
      tenantType: 'RESTAURANT',
    })

    const res = await request(app)
      .post('/api/register/complete')
      .send({
        accountType: 'RESTAURANT',
        businessName: 'My Rest',
        phone: '+971500000001',
      })
      .expect(201)

    expect(res.body.data.tenantType).toBe('RESTAURANT')
    expect(completeTenantRegistration).toHaveBeenCalled()
  })

  it('POST /complete creates supplier tenant', async () => {
    userNeedsTenantSetup.mockResolvedValue(true)
    completeTenantRegistration.mockResolvedValue({
      tenant: { id: 'sup-1', name: 'My Supply Co' },
      tenantType: 'SUPPLIER',
    })

    const res = await request(app)
      .post('/api/register/complete')
      .send({
        accountType: 'SUPPLIER',
        businessName: 'My Supply Co',
        phone: '+971500000002',
      })
      .expect(201)

    expect(res.body.data.tenantType).toBe('SUPPLIER')
    expect(completeTenantRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        accountType: 'SUPPLIER',
        businessName: 'My Supply Co',
      })
    )
  })

  it('POST /complete returns 409 when already set up', async () => {
    userNeedsTenantSetup.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/register/complete')
      .send({
        accountType: 'RESTAURANT',
        businessName: 'My Rest',
      })
      .expect(409)

    expect(res.body.error.name).toBe('CONFLICT')
  })

  it('POST /complete validates accountType enum', async () => {
    userNeedsTenantSetup.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/register/complete')
      .send({
        accountType: 'INVALID',
        businessName: 'Test',
      })
      .expect(400)

    expect(res.body.error.name).toBe('VALIDATION_ERROR')
    expect(completeTenantRegistration).not.toHaveBeenCalled()
  })
})
