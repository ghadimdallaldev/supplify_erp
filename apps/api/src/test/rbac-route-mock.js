import { vi } from 'vitest'
import { mockUser } from './helpers.js'

const passthrough = (_req, _res, next) => next()

/**
 * Partial rbac mock: keeps real permission middleware, stubs auth/tenant resolution.
 */
export async function loadRbacRouteMock(importOriginal, overrides = {}) {
  const actual = await importOriginal()
  return {
    ...actual,
    requireAuth: (req, res, next) => {
      req.userData = req.userData || { ...mockUser }
      next()
    },
    optionalAuth: (req, res, next) => {
      req.userData = req.userData || undefined
      next()
    },
    resolveTenantContext: (req, res, next) => {
      req.tenantContext = req.tenantContext || {
        permissions: ['ORDERS_VIEW', 'ORDERS_CREATE', 'ORDERS_MANAGE', 'SETTINGS_VIEW'],
        tenantId: 'restaurant-1',
        tenantType: 'RESTAURANT',
      }
      next()
    },
    requireRole: () => passthrough,
    requirePermission: () => passthrough,
    requireAnyPermission: () => passthrough,
    requireOwnership: () => passthrough,
    getRequestTenant: vi.fn().mockResolvedValue({
      tenantId: 'restaurant-1',
      tenantType: 'RESTAURANT',
      tenantName: 'Test Tenant',
    }),
    getRestaurantIdForRequest: vi.fn().mockResolvedValue('restaurant-1'),
    getSupplierIdForRequest: vi.fn().mockResolvedValue('supplier-1'),
    checkPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}
