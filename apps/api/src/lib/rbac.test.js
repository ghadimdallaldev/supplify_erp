import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  requireAuth,
  requireRole,
  requireOwnership,
  resolveAdminContext,
  getUserBySub,
  upsertUser,
  setAuthCookies,
  clearAuthCookies,
} from './rbac.js'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./auth.js', () => ({
  verifyToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const mockGetRolesForUser = vi.fn()
const mockGetPermissionsForUser = vi.fn()
vi.mock('./permissions.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getRolesForUser: (...args) => mockGetRolesForUser(...args),
    getPermissionsForUser: (...args) => mockGetPermissionsForUser(...args),
  }
})

vi.mock('./tenant-roles.js', () => ({
  ensureTenantSystemRoles: vi.fn().mockResolvedValue(undefined),
  assignOwnerRoleForUser: vi.fn().mockResolvedValue(undefined),
}))

describe('RBAC Utilities', () => {
  let req, res, next

  beforeEach(() => {
    vi.clearAllMocks()
    req = {
      cookies: {},
      user: null,
      userData: null,
      requestId: 'test-req-id',
    }
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    }
    next = vi.fn()
  })

  describe('requireAuth', () => {
    it('should allow authenticated user', async () => {
      req.cookies = { access_token: 'valid-token' }
      req.requestId = 'test-request-id'

      const { verifyToken } = await import('./auth.js')
      const { query } = await import('./db.js')

      verifyToken.mockResolvedValueOnce({ sub: 'sub-123' })
      query.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'test@example.com', keycloak_sub: 'sub-123' }],
      })

      await requireAuth(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should reject unauthenticated user', async () => {
      req.cookies = {}
      req.requestId = 'test-request-id'

      await requireAuth(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('requireRole', () => {
    it('should allow user with required role', () => {
      req.userData = { role: 'RESTAURANT' }
      const middleware = requireRole(['RESTAURANT', 'SUPPLIER'])

      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it('should reject user without required role', () => {
      req.userData = { role: 'RESTAURANT' }
      const middleware = requireRole(['ADMIN'])

      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('requireOwnership', () => {
    it('should allow owner access', () => {
      req.userData = { id: 'user-1', role: 'RESTAURANT' }
      req.requestId = 'test-request-id'

      const middleware = requireOwnership('RESTAURANT')
      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })

    it('should reject non-owner access', () => {
      req.userData = { id: 'user-1', role: 'RESTAURANT' }
      req.requestId = 'test-request-id'

      const middleware = requireOwnership('SUPPLIER')
      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(next).not.toHaveBeenCalled()
    })

    it('should allow admin access to any resource', () => {
      req.userData = { id: 'user-1', role: 'ADMIN' }
      req.requestId = 'test-request-id'

      const middleware = requireOwnership('SUPPLIER')
      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
    })
  })

  describe('upsertUser', () => {
    it('updates existing user matched by email when keycloak_sub differs (seed placeholder)', async () => {
      const { query } = await import('./db.js')
      const linkedUser = {
        id: 'user-admin',
        keycloak_sub: 'real-keycloak-uuid',
        email: 'admin@supplify.com',
        display_name: 'Admin User',
        role: 'ADMIN',
      }
      query.mockResolvedValueOnce({ rows: [linkedUser] })

      const user = await upsertUser(
        {
          sub: 'real-keycloak-uuid',
          email: 'admin@supplify.com',
          given_name: 'Admin',
          family_name: 'User',
        },
        ['admin']
      )

      expect(user).toEqual(linkedUser)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE keycloak_sub = $1 OR LOWER(email) = LOWER($2)'),
        ['real-keycloak-uuid', 'admin@supplify.com', 'Admin User', 'ADMIN', 'ADMIN']
      )
    })

    it('inserts new user when no row matches sub or email', async () => {
      const { query } = await import('./db.js')
      const newUser = {
        id: 'user-new',
        keycloak_sub: 'sub-new',
        email: 'new@example.com',
        display_name: 'New User',
        role: 'PENDING',
      }
      query.mockResolvedValueOnce({ rows: [newUser] })

      const user = await upsertUser(
        { sub: 'sub-new', email: 'new@example.com', given_name: 'New', family_name: 'User' },
        []
      )

      expect(user).toEqual(newUser)
      expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO app_user'), [
        'sub-new',
        'new@example.com',
        'New User',
        null,
        'PENDING',
      ])
    })
  })

  describe('getUserBySub', () => {
    it('should return user by Keycloak sub', async () => {
      const { query } = await import('./db.js')
      query.mockResolvedValueOnce({
        rows: [{ id: 'user-1', keycloak_sub: 'sub-123', email: 'test@example.com' }],
      })

      const user = await getUserBySub('sub-123')

      expect(user).toBeDefined()
      expect(user.email).toBe('test@example.com')
      expect(query).toHaveBeenCalledWith('SELECT * FROM app_user WHERE keycloak_sub = $1', [
        'sub-123',
      ])
    })

    it('should return null for non-existent user', async () => {
      const { query } = await import('./db.js')
      query.mockResolvedValueOnce({
        rows: [],
      })

      const user = await getUserBySub('non-existent')

      expect(user).toBeNull()
      expect(query).toHaveBeenCalledWith('SELECT * FROM app_user WHERE keycloak_sub = $1', [
        'non-existent',
      ])
    })
  })

  describe('setAuthCookies', () => {
    it('should set access and refresh token cookies', () => {
      setAuthCookies(res, 'access-token', 'refresh-token')

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'access-token',
        expect.objectContaining({
          httpOnly: true,
        })
      )
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({
          httpOnly: true,
        })
      )
    })
  })

  describe('clearAuthCookies', () => {
    it('should clear auth cookies', () => {
      clearAuthCookies(res)

      expect(res.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({ path: '/' })
      )
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.objectContaining({ path: '/' })
      )
    })
  })

  describe('resolveAdminContext', () => {
    it('sets adminContext with roles and permissions when user is ADMIN', async () => {
      req.userData = { id: 'admin-1', role: 'ADMIN' }
      mockGetRolesForUser.mockResolvedValueOnce(['SUPER_ADMIN'])
      mockGetPermissionsForUser.mockResolvedValueOnce(['ADMIN_ACCESS', 'ADMIN_TENANTS'])

      await resolveAdminContext(req, res, next)

      expect(req.adminContext).toEqual({
        roles: ['SUPER_ADMIN'],
        permissions: ['ADMIN_ACCESS', 'ADMIN_TENANTS'],
      })
      expect(next).toHaveBeenCalledTimes(1)
      expect(mockGetRolesForUser).toHaveBeenCalledWith('admin-1', null, 'ADMIN')
      expect(mockGetPermissionsForUser).toHaveBeenCalledWith('admin-1', null, 'ADMIN')
    })

    it('sets adminContext null and calls next when user is not ADMIN', async () => {
      req.userData = { id: 'user-1', role: 'RESTAURANT' }

      await resolveAdminContext(req, res, next)

      expect(req.adminContext).toBeNull()
      expect(next).toHaveBeenCalledTimes(1)
      expect(mockGetRolesForUser).not.toHaveBeenCalled()
    })

    it('sets empty adminContext and calls next on error (no 500)', async () => {
      req.userData = { id: 'admin-1', role: 'ADMIN' }
      mockGetRolesForUser.mockRejectedValueOnce(new Error('DB error'))

      await resolveAdminContext(req, res, next)

      expect(req.adminContext).toEqual({ roles: [], permissions: [] })
      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
    })
  })
})
