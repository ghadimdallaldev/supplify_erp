import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMocks, mockUser, clearAllMocks } from '../test/helpers.js'

// Setup mocks at top level
vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  return {
    query: queryMock,
    pool: { query: queryMock },
    __queryMock: queryMock,
  }
})

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../lib/auth.js', () => ({
  getAuthorizationUrl: vi.fn().mockResolvedValue('https://keycloak.example.com/auth'),
  exchangeCodeForTokens: vi.fn().mockResolvedValue({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
  }),
  getUserInfo: vi.fn().mockResolvedValue({
    sub: 'keycloak-sub-123',
    email: 'test@example.com',
    preferred_username: 'testuser',
  }),
  revokeToken: vi.fn().mockResolvedValue(true),
  refreshAccessToken: vi.fn().mockResolvedValue({
    access_token: 'new-access-token',
    refresh_token: 'new-refresh-token',
  }),
}))

vi.mock('../lib/rbac.js', () => ({
  requireAuth: vi.fn(async (req, res, next) => {
    // Simple mock - just set userData and continue
    req.userData = req.userData || {
      ...mockUser,
      id: 'user-1',
      email: 'test@example.com',
      role: 'RESTAURANT',
      display_name: 'Test User',
      created_at: new Date(),
    }
    next()
  }),
  upsertUser: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'test@example.com',
    role: 'RESTAURANT',
    keycloak_sub: 'sub-123',
    display_name: 'Test User',
    created_at: new Date(),
    updated_at: new Date(),
  }),
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
  getUserBySub: vi
    .fn()
    .mockResolvedValue({ id: 'user-1', email: 'test@example.com', keycloak_sub: 'sub-123' }),
}))

// Import routes after mocks
import { authRoutes } from './auth.routes.js'

describe('Auth Routes', () => {
  let app
  let db

  beforeEach(async () => {
    clearAllMocks()
    db = setupMocks()

    // Sync db mocks
    const dbModule = await import('../lib/db.js')
    vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.session = {}
      req.session.save = (callback) => {
        if (callback) callback(null)
      }
      req.requestId = 'test-request-id'
      req.user = mockUser
      req.userData = {
        ...mockUser,
        id: 'user-1',
        email: 'test@example.com',
        role: 'RESTAURANT',
        display_name: 'Test User',
        created_at: new Date(),
      }
      next()
    })
    app.use('/auth', authRoutes)
    const { errorHandler } = await import('../middlewares/errorHandler.js')
    app.use(errorHandler)
  })

  describe('GET /auth/login', () => {
    it('should redirect to Keycloak authorization URL', async () => {
      const response = await request(app).get('/auth/login').expect(302)

      expect(response.headers.location).toContain('keycloak')
    })

    it('should store OAuth state in session', async () => {
      const session = {}
      const appWithSession = express()
      appWithSession.use(express.json())
      appWithSession.use((req, res, next) => {
        req.session = session
        req.session.save = (callback) => {
          if (callback) callback(null)
        }
        req.requestId = 'test-request'
        next()
      })
      appWithSession.use('/auth', authRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      appWithSession.use(errorHandler)

      await request(appWithSession).get('/auth/login')

      expect(session.oauthState).toBeDefined()
    })
  })

  describe('GET /auth/callback', () => {
    it('should handle successful OAuth callback', async () => {
      // Setup database mocks first - sync with test db mock
      const dbModule = await import('../lib/db.js')
      vi.mocked(dbModule.query).mockImplementation((...args) => db.query(...args))

      const session = { oauthState: 'test-state' }
      const appWithSession = express()
      appWithSession.use(express.json())
      appWithSession.use((req, res, next) => {
        req.session = { ...session }
        req.sessionID = 'test-session-id'
        req.session.save = (callback) => {
          if (callback) callback(null)
        }
        req.requestId = 'test-request'
        try {
          Object.defineProperty(req, 'protocol', { value: 'http', configurable: true })
        } catch (_) {
          /* ignore if protocol is not configurable */
        }
        req.get = (header) => (header === 'host' ? 'localhost:4000' : null)
        next()
      })
      appWithSession.use('/auth', authRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      appWithSession.use(errorHandler)

      const { exchangeCodeForTokens, getUserInfo } = await import('../lib/auth.js')
      const rbacModule = await import('../lib/rbac.js')
      const upsertUser = rbacModule.upsertUser

      // Mock the functions to return proper data
      // The route decodes the access token to get roles, so we need a valid JWT-like structure
      const clientId = process.env.KEYCLOAK_CLIENT_ID || 'supplify-api'
      const payload = {
        sub: 'sub-123',
        email: 'test@example.com',
        realm_access: { roles: ['restaurant'] },
        resource_access: { [clientId]: { roles: ['restaurant'] } },
      }
      const header = { alg: 'HS256', typ: 'JWT' }
      const mockAccessToken =
        Buffer.from(JSON.stringify(header)).toString('base64url') +
        '.' +
        Buffer.from(JSON.stringify(payload)).toString('base64url') +
        '.signature'

      vi.mocked(exchangeCodeForTokens).mockResolvedValueOnce({
        access_token: mockAccessToken,
        refresh_token: 'refresh-token',
      })
      vi.mocked(getUserInfo).mockResolvedValueOnce({
        sub: 'sub-123',
        email: 'test@example.com',
        given_name: 'Test',
        family_name: 'User',
      })

      // Ensure upsertUser mock returns the user - the mock is already set up at module level
      // The route imports upsertUser at the top level, so it should use the mocked version
      // But we need to ensure it returns the right value for this specific call
      vi.mocked(upsertUser).mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        role: 'RESTAURANT',
        keycloak_sub: 'sub-123',
        display_name: 'Test User',
        created_at: new Date(),
        updated_at: new Date(),
      })

      // Also mock database query as fallback in case the real upsertUser is called
      // The real upsertUser calls query() to insert/update user
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'test@example.com',
            role: 'RESTAURANT',
            keycloak_sub: 'sub-123',
            display_name: 'Test User',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      })

      const originalWebOrigin = process.env.WEB_ORIGIN
      const originalKeycloakClient = process.env.KEYCLOAK_CLIENT_ID
      process.env.WEB_ORIGIN = 'http://localhost:3000'
      process.env.KEYCLOAK_CLIENT_ID = 'supplify-api'

      const response = await request(appWithSession)
        .get('/auth/callback?code=test-code&state=test-state')
        .expect(302)
      expect(exchangeCodeForTokens).toHaveBeenCalled()
      expect(getUserInfo).toHaveBeenCalled()
      expect(upsertUser).toHaveBeenCalled()

      if (originalWebOrigin !== undefined) process.env.WEB_ORIGIN = originalWebOrigin
      else delete process.env.WEB_ORIGIN
      if (originalKeycloakClient !== undefined)
        process.env.KEYCLOAK_CLIENT_ID = originalKeycloakClient
      else delete process.env.KEYCLOAK_CLIENT_ID
    })

    it('should reject callback with invalid state', async () => {
      const session = { oauthState: 'valid-state' }
      const appWithSession = express()
      appWithSession.use(express.json())
      appWithSession.use((req, res, next) => {
        req.session = session
        req.sessionID = 'test-session-id'
        req.session.save = (callback) => {
          if (callback) callback(null)
        }
        req.requestId = 'test-request'
        try {
          Object.defineProperty(req, 'protocol', { value: 'http', configurable: true })
        } catch (_) {
          /* ignore if protocol is not configurable */
        }
        req.get = (header) => (header === 'host' ? 'localhost:4000' : null)
        next()
      })
      appWithSession.use('/auth', authRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      appWithSession.use(errorHandler)

      const originalWebOrigin = process.env.WEB_ORIGIN
      process.env.WEB_ORIGIN = 'http://localhost:3000'

      const response = await request(appWithSession)
        .get('/auth/callback?code=test-code&state=invalid-state')
        .expect(302)

      expect(response.headers.location).toContain('login?error=invalid_state')

      if (originalWebOrigin !== undefined) process.env.WEB_ORIGIN = originalWebOrigin
      else delete process.env.WEB_ORIGIN
    })
  })

  describe('GET /auth/me', () => {
    it('should return current user data', async () => {
      // Mock database query for restaurant lookup
      db.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'restaurant-1',
            name: 'Test Restaurant',
            contact_email: 'test@example.com',
          },
        ],
      })

      const response = await request(app).get('/auth/me').expect(200)

      expect(response.body.ok).toBe(true)
      expect(response.body.data.email).toBe('test@example.com')
      expect(response.body.data.role).toBe('RESTAURANT')
    })
  })

  describe('POST /auth/logout', () => {
    it('should clear auth cookies and redirect', async () => {
      const { clearAuthCookies } = await import('../lib/rbac.js')
      const { revokeToken } = await import('../lib/auth.js')

      const response = await request(app)
        .post('/auth/logout')
        .set('Cookie', 'refresh_token=test-refresh-token')
        .expect(200)

      expect(clearAuthCookies).toHaveBeenCalled()
      expect(response.body.ok).toBe(true)
    })
  })

  describe('POST /auth/refresh', () => {
    it('should refresh access token', async () => {
      const cookieParser = (await import('cookie-parser')).default
      const { refreshAccessToken } = await import('../lib/auth.js')
      const { setAuthCookies } = await import('../lib/rbac.js')

      // Add cookie-parser middleware to app
      const appWithCookies = express()
      appWithCookies.use(cookieParser())
      appWithCookies.use(express.json())
      appWithCookies.use((req, res, next) => {
        req.requestId = 'test-request-id'
        next()
      })
      appWithCookies.use('/auth', authRoutes)
      const { errorHandler } = await import('../middlewares/errorHandler.js')
      appWithCookies.use(errorHandler)

      // Mock refreshAccessToken to return new tokens
      vi.mocked(refreshAccessToken).mockResolvedValueOnce({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      })

      const response = await request(appWithCookies)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=valid-refresh-token')
        .expect(200)

      expect(refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token')
      expect(setAuthCookies).toHaveBeenCalled()
      expect(response.body.ok).toBe(true)
    })

    it('should reject invalid refresh token', async () => {
      const response = await request(app).post('/auth/refresh').expect(401)

      expect(response.body.ok).toBe(false)
      expect(response.body.error.name).toBe('UNAUTHORIZED')
    })
  })
})
