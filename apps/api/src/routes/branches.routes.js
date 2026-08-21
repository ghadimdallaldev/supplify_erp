import express from 'express'
import {
  requireAuth,
  requireRole,
  getRestaurantIdForRequest,
  getSupplierIdForRequest,
  resolveTenantContext,
  resolveAdminContext,
  isBearerAuthRequest,
} from '../lib/rbac.js'
import { settingsMutationGuard } from '../lib/route-permissions.js'
import { getEffectiveTenant } from '../lib/impersonation.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { checkLinkedAccountLimit, createAuditLog } from '../lib/plan-enforcement.js'
import { requireFeature } from '../lib/subscription.js'
import {
  listLinkedAccounts,
  createLinkedBranchAccount,
  removeLinkedBranchAccount,
} from '../lib/linked-accounts.js'
import {
  createActiveTenantToken,
  getActiveTenantCookieName,
  getPrimaryTenantForUser,
  canSwitchActiveTenant,
} from '../lib/tenant-switch.js'
import { config } from '../config/env.js'

const router = express.Router()

const multiBranchFeature = requireFeature(
  'multi_branch',
  (req) => req.tenantContext?.tenantId || req.activeTenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || req.userData?.role || 'RESTAURANT'
)

router.use(requireAuth, resolveTenantContext, resolveAdminContext, settingsMutationGuard)

async function resolveParentTenant(req) {
  if (req.userData.role === 'ADMIN') {
    const restaurantId = req.query.restaurant_id
    const supplierId = req.query.supplier_id
    const effectiveTenant = getEffectiveTenant(req)
    if (effectiveTenant) {
      if (
        restaurantId &&
        (effectiveTenant.tenantType !== 'RESTAURANT' || restaurantId !== effectiveTenant.tenantId)
      ) {
        return null
      }
      if (
        supplierId &&
        (effectiveTenant.tenantType !== 'SUPPLIER' || supplierId !== effectiveTenant.tenantId)
      ) {
        return null
      }
      return { parentId: effectiveTenant.tenantId, parentType: effectiveTenant.tenantType }
    }
    const adminPermissions = req.adminContext?.permissions || []
    const canQueryAnyTenant =
      adminPermissions.includes('ADMIN_TENANTS') || adminPermissions.includes('ADMIN_ACCESS')
    if (restaurantId && canQueryAnyTenant) {
      return { parentId: restaurantId, parentType: 'RESTAURANT' }
    }
    if (supplierId && canQueryAnyTenant) {
      return { parentId: supplierId, parentType: 'SUPPLIER' }
    }
    return null
  }

  const restaurantId = await getRestaurantIdForRequest(req)
  if (restaurantId) return { parentId: restaurantId, parentType: 'RESTAURANT' }

  const supplierId = await getSupplierIdForRequest(req)
  if (supplierId) return { parentId: supplierId, parentType: 'SUPPLIER' }

  return null
}

/**
 * GET /api/branches
 * List primary account + linked branch accounts (each branch is its own tenant).
 */
router.get('/', requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const parent = await resolveParentTenant(req)
    if (!parent) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'BAD_REQUEST', message: 'Tenant context required' },
        requestId: req.requestId,
      })
    }

    const { primary, linked } = await listLinkedAccounts(parent.parentId, parent.parentType)
    const activeTenantId =
      req.activeTenantContext?.tenantId || req.tenantContext?.tenantId || primary?.id

    res.json({
      ok: true,
      data: {
        accounts: primary ? [{ ...primary, tenantType: parent.parentType }, ...linked] : linked,
        branches: linked,
        primaryAccountId: primary?.id ?? null,
        activeAccountId: activeTenantId,
        tenantType: parent.parentType,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get linked accounts error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get branch accounts' },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /api/branches
 * Create a new linked branch account (separate restaurant/supplier tenant).
 */
router.post('/', requireRole(['RESTAURANT', 'SUPPLIER']), multiBranchFeature, async (req, res) => {
  try {
    const parent = await resolveParentTenant(req)
    if (!parent) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'BAD_REQUEST', message: 'Tenant context required' },
        requestId: req.requestId,
      })
    }

    const primary = await getPrimaryTenantForUser(req.userData.email, parent.parentType)
    const parentId = primary?.id || parent.parentId

    const limitCheck = await checkLinkedAccountLimit(parentId, parent.parentType)
    if (!limitCheck.allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'LIMIT_EXCEEDED',
          message: limitCheck.reason,
          details: {
            limitKey: 'branches',
            limitValue: limitCheck.limit ?? 0,
            currentUsage: limitCheck.current ?? 0,
            currentPlan: limitCheck.currentPlan ?? null,
            recommendedPlans: limitCheck.requiredPlan ? [limitCheck.requiredPlan] : ['Scale'],
            upgradeUrl: '/app/settings?tab=subscription',
          },
        },
        requestId: req.requestId,
      })
    }

    const { name, phone, address, contact_phone } = req.body
    const branchName = name || req.body.branchName
    if (!branchName) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Branch name is required' },
        requestId: req.requestId,
      })
    }

    const tenant = await createLinkedBranchAccount({
      parentTenantId: parentId,
      parentTenantType: parent.parentType,
      userId: req.userData.id,
      ownerEmail: req.userData.email,
      branchName,
      phone: phone || contact_phone || null,
      address: typeof address === 'string' ? { street: address } : address || null,
    })

    await createAuditLog('CREATE_BRANCH_ACCOUNT', {
      entityType: parent.parentType,
      entityId: tenant.id,
      description: `Created linked branch account: ${branchName}`,
      changes: { branchName, parentId },
    })

    res.status(201).json({
      ok: true,
      data: { branch: tenant, account: tenant },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Create linked branch account error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create branch account',
      },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /api/branches/switch
 * Switch active tenant context (primary or linked branch account).
 */
router.post('/switch', requireRole(['RESTAURANT', 'SUPPLIER']), async (req, res) => {
  try {
    const { tenantId, tenantType } = req.body
    const roleType = req.userData.role

    if (!tenantId) {
      res.clearCookie(getActiveTenantCookieName(), {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
      })
      return res.json({
        ok: true,
        data: {
          activeAccountId: null,
          cleared: true,
          ...(isBearerAuthRequest(req) ? { activeTenantToken: null } : {}),
        },
        error: null,
        requestId: req.requestId,
      })
    }

    const resolvedType = tenantType || roleType
    const allowed = await canSwitchActiveTenant(req, tenantId, resolvedType)
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'You do not have access to this account' },
        requestId: req.requestId,
      })
    }

    const table = resolvedType === 'SUPPLIER' ? 'supplier' : 'restaurant'
    const { rows } = await query(`SELECT id, name, is_branch_active FROM ${table} WHERE id = $1`, [
      tenantId,
    ])
    if (!rows.length || rows[0].is_branch_active === false) {
      res.clearCookie(getActiveTenantCookieName(), {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
      })
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Account not found or inactive' },
        requestId: req.requestId,
      })
    }

    const { invalidateUserPermissionCache } = await import('../lib/permissions.js')
    await invalidateUserPermissionCache(req.userData.id, tenantId, resolvedType)

    const token = await createActiveTenantToken({
      userId: req.userData.id,
      tenantId,
      tenantType: resolvedType,
      tenantName: rows[0].name,
    })

    res.cookie(getActiveTenantCookieName(), token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    })

    res.json({
      ok: true,
      data: {
        activeAccountId: tenantId,
        tenantName: rows[0].name,
        tenantType: resolvedType,
        // Native clients cannot read the HttpOnly cookie. Only return the scoped
        // tenant token when the request authenticated with a bearer token.
        ...(isBearerAuthRequest(req) ? { activeTenantToken: token } : {}),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Switch branch account error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to switch account' },
      requestId: req.requestId,
    })
  }
})

/**
 * DELETE /api/branches/:childTenantId
 * Unlink a branch account from the parent (does not delete tenant data).
 */
router.delete(
  '/:childTenantId',
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const parent = await resolveParentTenant(req)
      if (!parent) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'BAD_REQUEST', message: 'Tenant context required' },
          requestId: req.requestId,
        })
      }

      const primary = await getPrimaryTenantForUser(req.userData.email, parent.parentType)
      const parentId = primary?.id || parent.parentId

      const removed = await removeLinkedBranchAccount({
        parentTenantId: parentId,
        parentTenantType: parent.parentType,
        childTenantId: req.params.childTenantId,
      })

      if (!removed) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Linked branch account not found' },
          requestId: req.requestId,
        })
      }

      res.json({
        ok: true,
        data: { removed: true, childTenantId: req.params.childTenantId },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Delete linked branch account error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to remove branch account' },
        requestId: req.requestId,
      })
    }
  }
)

export default router
