import { isSupplifyV2 } from '../config/supplifyModel.js'
import {
  getRestaurantWorkspaceMode,
  hasActiveSupplierRestaurantLink,
  WORKSPACE_MODE_BUYER_ONLY,
} from '../lib/restaurant-workspace.js'
import { getRequestTenant } from '../lib/rbac.js'

export function buildBuyerWorkspaceUpgradePayload() {
  return {
    name: 'BUYER_WORKSPACE_LIMIT',
    message:
      'This feature requires a full restaurant workspace. Upgrade to manage staff, reservations, analytics, and multi-supplier operations.',
    upgradeRequired: true,
    workspaceMode: WORKSPACE_MODE_BUYER_ONLY,
  }
}

/**
 * V2 buyer-only: catalog list/detail must target a linked supplier.
 */
export function requireBuyerSupplierCatalogAccess() {
  return async (req, res, next) => {
    if (!isSupplifyV2()) return next()
    try {
      const tenant = req.tenantContext || (await getRequestTenant(req))
      if (!tenant || tenant.tenantType !== 'RESTAURANT') return next()

      const mode = await getRestaurantWorkspaceMode(tenant.tenantId)
      if (mode !== WORKSPACE_MODE_BUYER_ONLY) return next()

      const supplierId = req.query?.supplier
      if (!supplierId || typeof supplierId !== 'string') {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'BUYER_CATALOG_SCOPE',
            message: 'Select an invited supplier store to browse products.',
          },
          requestId: req.requestId,
        })
      }

      const linked = await hasActiveSupplierRestaurantLink(tenant.tenantId, supplierId)
      if (!linked) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'SUPPLIER_NOT_LINKED',
            message: 'You can only browse catalogs from suppliers that invited your restaurant.',
          },
          requestId: req.requestId,
        })
      }
      return next()
    } catch (err) {
      return next(err)
    }
  }
}

/** Block non-GET restaurant-finance mutations for buyer-only workspaces. */
export function requireFullRestaurantWorkspaceUnlessReadOnly() {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next()
    return requireFullRestaurantWorkspace()(req, res, next)
  }
}

/**
 * Block premium restaurant features for V2 buyer-only workspaces.
 */
export function requireFullRestaurantWorkspace() {
  return async (req, res, next) => {
    if (!isSupplifyV2()) return next()
    try {
      const tenant = req.tenantContext || (await getRequestTenant(req))
      if (!tenant || tenant.tenantType !== 'RESTAURANT') return next()

      const mode = await getRestaurantWorkspaceMode(tenant.tenantId)
      if (mode !== WORKSPACE_MODE_BUYER_ONLY) return next()

      return res.status(403).json({
        ok: false,
        data: null,
        error: buildBuyerWorkspaceUpgradePayload(),
        requestId: req.requestId,
      })
    } catch (err) {
      return next(err)
    }
  }
}

/**
 * V2 buyer-only: require active supplier link for ordering/catalog against that supplier.
 */
export function requireSupplierRestaurantLink(getSupplierId) {
  return async (req, res, next) => {
    if (!isSupplifyV2()) return next()
    try {
      const tenant = req.tenantContext || (await getRequestTenant(req))
      if (!tenant || tenant.tenantType !== 'RESTAURANT') return next()

      const mode = await getRestaurantWorkspaceMode(tenant.tenantId)
      if (mode !== WORKSPACE_MODE_BUYER_ONLY) return next()

      const supplierId =
        typeof getSupplierId === 'function'
          ? getSupplierId(req)
          : req.params?.id || req.body?.supplier_id

      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'supplier_id is required' },
          requestId: req.requestId,
        })
      }

      const linked = await hasActiveSupplierRestaurantLink(tenant.tenantId, supplierId)
      if (!linked) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'SUPPLIER_NOT_LINKED',
            message: 'You can only order from suppliers that invited your restaurant.',
          },
          requestId: req.requestId,
        })
      }
      return next()
    } catch (err) {
      return next(err)
    }
  }
}
