import express from 'express'
import { vi } from 'vitest'
import { NotFoundError, errorHandler } from '../middlewares/errorHandler.js'

export const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  role: 'RESTAURANT',
  tenant_id: 'tenant-1',
  tenant_type: 'RESTAURANT',
}

export const mockAdminUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
  tenant_id: null,
  tenant_type: null,
}

export const mockSupplierUser = {
  id: 'supplier-1',
  email: 'supplier@example.com',
  role: 'SUPPLIER',
  tenant_id: 'supplier-tenant-1',
  tenant_type: 'SUPPLIER',
}

export const createMockApp = (routes, options = {}) => {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  // Mock session middleware
  app.use((req, res, next) => {
    req.session = options.session || {}
    req.session.save = (callback) => {
      if (callback) callback(null)
    }
    next()
  })

  // Add request context middleware
  app.use((req, res, next) => {
    req.requestId = options.requestId || 'test-request-id'
    req.user = options.user || mockUser
    req.userData = options.userData || { ...mockUser }
    next()
  })

  if (routes) {
    // Mount routes with appropriate prefix
    if (typeof routes === 'function') {
      // It's a router, mount it
      app.use(routes)
    } else if (routes.default) {
      app.use(routes.default)
    } else {
      app.use(routes)
    }
  }

  // Add 404 handler
  app.use((req, res, next) => {
    next(new NotFoundError())
  })

  app.use(errorHandler)

  return app
}

export const createMockDb = () => {
  const queryMock = vi.fn()
  const withTransactionMock = vi.fn((handler) =>
    handler({
      query: (...args) => queryMock(...args),
    })
  )

  return {
    query: queryMock,
    withTransaction: withTransactionMock,
    pool: {
      query: queryMock,
    },
  }
}

// Global mock storage - initialized immediately
let mockStorage = null

export const setupMocks = () => {
  const db = createMockDb()
  mockStorage = db
  return db
}

export const getMockQuery = () => mockStorage?.query || vi.fn()
export const getMockWithTransaction = () =>
  mockStorage?.withTransaction || vi.fn((handler) => handler({ query: vi.fn() }))

export const clearAllMocks = () => {
  vi.clearAllMocks()
}
