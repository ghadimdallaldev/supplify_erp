import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveRequestBillingSubscription = vi.fn()
const resolveRequestSubscription = vi.fn()
const getRolesForUser = vi.fn()
const getPermissionsForUser = vi.fn()
const getEffectiveTenant = vi.fn()
const canUseCrossRequestTenantCaches = vi.fn()
const getActiveTenantFromRequest = vi.fn()
const getTenantAssignmentForUser = vi.fn()
const userCanAccessTenant = vi.fn()
const getCache = vi.fn()
const setCache = vi.fn()

vi.mock('./db.js', () => ({ query: vi.fn() }))
vi.mock('./logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))
vi.mock('../middlewares/request-timing.js', () => ({
  startStage: vi.fn(),
  mark: vi.fn(),
  noteCacheHit: vi.fn(),
}))
vi.mock('./request-log-context.js', () => ({
  syncRequestLogContext: vi.fn(),
}))
vi.mock('./request-subscription.js', () => ({
  resolveRequestBillingSubscription: (...args) => resolveRequestBillingSubscription(...args),
  resolveRequestSubscription: (...args) => resolveRequestSubscription(...args),
}))
vi.mock('./impersonation.js', () => ({
  getEffectiveTenant: (...args) => getEffectiveTenant(...args),
  impersonationCanAccessBranch: vi.fn(),
  getImpersonationEffectivePermissions: vi.fn(),
  isImpersonating: vi.fn(),
}))
vi.mock('./tenant-switch.js', () => ({
  getActiveTenantFromRequest: (...args) => getActiveTenantFromRequest(...args),
  getPrimaryTenantForUser: vi.fn(),
  userCanAccessTenant: (...args) => userCanAccessTenant(...args),
}))
vi.mock('./workspace-tenant.js', () => ({
  getTenantAssignmentForUser: (...args) => getTenantAssignmentForUser(...args),
  isPrimaryTenantContact: vi.fn().mockResolvedValue(false),
}))
vi.mock('./permissions.js', () => ({
  getRolesForUser: (...args) => getRolesForUser(...args),
  getPermissionsForUser: (...args) => getPermissionsForUser(...args),
  hasPermission: vi.fn(),
  invalidateUserPermissionCache: vi.fn(),
}))
vi.mock('./tenant-context-cache.js', () => ({
  canUseCrossRequestTenantCaches: (...args) => canUseCrossRequestTenantCaches(...args),
  getTenantContextBundle: vi.fn(),
  setTenantContextBundle: vi.fn(),
}))
vi.mock('./tenant-roles.js', () => ({
  ensureTenantSystemRoles: vi.fn().mockResolvedValue(undefined),
  assignOwnerRoleForUser: vi.fn(),
  userHasOwnerRole: vi.fn(),
}))
vi.mock('./cache.js', () => ({
  getCache: (...args) => getCache(...args),
  setCache: (...args) => setCache(...args),
  deleteCache: vi.fn(),
}))
vi.mock('./singleflight.js', () => ({
  singleflight: (_key, fn) => fn(),
}))
vi.mock('./auth.js', () => ({
  verifyToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}))
vi.mock('../config/env.js', () => ({
  config: { NODE_ENV: 'test', ALLOW_AUTO_SUPER_ADMIN: false },
}))

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

function runMiddleware(middleware, req, res) {
  return new Promise((resolve) => {
    const finish = () => resolve({ req, res, nextCalled: Boolean(res._nextCalled) })
    const next = () => {
      res._nextCalled = true
      finish()
    }
    const origStatus = res.status.bind(res)
    res.status = (code) => {
      origStatus(code)
      queueMicrotask(finish)
      return res
    }
    middleware(req, res, next)
  })
}

describe('resolveTenantContext suspended recovery allowlist', () => {
  let resolveTenantContext

  beforeEach(async () => {
    vi.clearAllMocks()
    getEffectiveTenant.mockReturnValue(null)
    getActiveTenantFromRequest.mockResolvedValue(null)
    canUseCrossRequestTenantCaches.mockReturnValue(false)
    getCache.mockResolvedValue(null)
    setCache.mockResolvedValue(undefined)
    getTenantAssignmentForUser.mockResolvedValue({
      tenantId: 't1',
      tenantType: 'SUPPLIER',
      tenantName: 'Gulf Chef',
    })
    userCanAccessTenant.mockResolvedValue(true)
    getRolesForUser.mockResolvedValue(['Owner'])
    getPermissionsForUser.mockResolvedValue(['SUBSCRIPTIONS_VIEW', 'SETTINGS_MANAGE'])
    resolveRequestSubscription.mockResolvedValue(undefined)
    resolveRequestBillingSubscription.mockResolvedValue({ status: 'SUSPENDED' })

    vi.resetModules()
    ;({ resolveTenantContext } = await import('./rbac.js'))
  })

  it('blocks suspended tenants on non-recovery routes', async () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/supplier/command-center',
      path: '/command-center',
      headers: {},
      userData: { id: 'u1', role: 'SUPPLIER', email: 's@example.com' },
      requestId: 'r1',
    }
    const res = mockRes()
    await runMiddleware(resolveTenantContext, req, res)

    expect(res._nextCalled).toBeFalsy()
    expect(res.statusCode).toBe(403)
    expect(res.body?.error?.name).toBe('SUBSCRIPTION_SUSPENDED')
  })

  it('allows suspended tenants through on entitlements recovery path', async () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/subscriptions/entitlements',
      path: '/entitlements',
      headers: {},
      userData: { id: 'u1', role: 'SUPPLIER', email: 's@example.com' },
      requestId: 'r2',
    }
    const res = mockRes()
    await runMiddleware(resolveTenantContext, req, res)

    expect(res.statusCode).toBe(200)
    expect(res._nextCalled).toBe(true)
    expect(req.tenantContext?.tenantId).toBe('t1')
  })

  it('allows suspended tenants through on billing status recovery path', async () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/billing/status',
      path: '/status',
      headers: {},
      userData: { id: 'u1', role: 'SUPPLIER', email: 's@example.com' },
      requestId: 'r3',
    }
    const res = mockRes()
    await runMiddleware(resolveTenantContext, req, res)

    expect(res._nextCalled).toBe(true)
    expect(req.tenantContext?.tenantId).toBe('t1')
  })
})
