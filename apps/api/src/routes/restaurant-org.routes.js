import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { orgStructureGuard } from '../lib/route-permissions.js'
import { requireFeature } from '../lib/subscription.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { checkLinkedAccountLimit, createAuditLog } from '../lib/plan-enforcement.js'
import { getEffectiveTenant } from '../lib/impersonation.js'
import {
  getUserRestaurantOrgMembership,
  listRestaurantOrgBranches,
  listRestaurantOrgBranchesForUser,
  createRestaurantOrgBranch,
  deactivateRestaurantOrgBranch,
  reactivateRestaurantOrgBranch,
  unlinkRestaurantFromOrganization,
  assignRestaurantOrgUserRole,
  grantRestaurantOrgBranchAccess,
  revokeRestaurantOrgBranchAccess,
  userHasRestaurantOrgBranchAccess,
  invalidateRestaurantOrgPermissionCaches,
} from '../lib/restaurant-org.js'
import {
  createActiveTenantToken,
  getActiveTenantCookieName,
  userCanAccessTenant,
  isTenantBranchActive,
} from '../lib/tenant-switch.js'
import { config } from '../config/env.js'
import {
  createBranchAccountLinkInvitation,
  listBranchAccountLinkInvitations,
  cancelBranchAccountLinkInvitation,
  resendBranchAccountLinkInvitation,
} from '../lib/branch-account-link-invitations.js'
import {
  applyOrgBillingOnUnlink,
  recordBranchAccountLinkHistory,
} from '../lib/branch-account-billing.js'
import { restaurantOrgConsolidatedOverview } from '../services/org-reports.service.js'
import {
  assertCentralPurchasingEnabled,
  listCentralPurchasingBranchAccounts,
  getOrCreateCentralPurchasingDraft,
  listCentralPurchasingDrafts,
  updateCentralPurchasingDraftLines,
  submitCentralPurchasingDrafts,
} from '../services/central-purchasing.service.js'

const router = express.Router()

const multiBranchFeature = requireFeature(
  'multi_branch',
  (req) => req.restaurantOrgContext?.primaryRestaurantId,
  () => 'RESTAURANT'
)

async function requireRestaurantOrgContext(req, res, next) {
  if (req.userData?.role !== 'RESTAURANT' && req.userData?.role !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Restaurant organization access required' },
      requestId: req.requestId,
    })
  }

  const membership = await getUserRestaurantOrgMembership(req.userData.id)

  let organizationId = membership?.organization_id
  let organizationName = membership?.organization_name || ''
  let primaryRestaurantId = null

  if (req.userData.role === 'ADMIN' && req.query.organization_id) {
    organizationId = req.query.organization_id
  }

  if (organizationId) {
    const { rows: mainRows } = await query(
      `SELECT id FROM restaurant WHERE organization_id = $1 AND is_main_branch = true LIMIT 1`,
      [organizationId]
    )
    primaryRestaurantId = mainRows[0]?.id || null
    if (!primaryRestaurantId) {
      const { rows: anyBranch } = await query(
        `SELECT id FROM restaurant WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [organizationId]
      )
      primaryRestaurantId = anyBranch[0]?.id || null
    }
  } else if (req.userData.role === 'RESTAURANT' || req.userData.role === 'ADMIN') {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (restaurantId) {
      const { rows } = await query(`SELECT organization_id FROM restaurant WHERE id = $1`, [
        restaurantId,
      ])
      organizationId = rows[0]?.organization_id
      primaryRestaurantId = restaurantId
    }
  }

  if (organizationId && !organizationName) {
    const { rows: orgRows } = await query(
      `SELECT name FROM restaurant_organizations WHERE id = $1`,
      [organizationId]
    )
    organizationName = orgRows[0]?.name || ''
  }

  req.restaurantOrgContext = {
    organizationId,
    organizationName,
    roleName: membership?.role_name || null,
    primaryRestaurantId,
    isOrgOwner: membership?.role_name === 'Org Owner',
    isOrgManager: membership?.role_name === 'Org Manager',
    canManageAllBranches:
      membership?.role_name === 'Org Owner' ||
      membership?.role_name === 'Org Manager' ||
      membership?.role_name === 'Org Viewer',
  }
  next()
}

function requireRestaurantOrgOwner(req, res, next) {
  if (req.userData?.role === 'ADMIN') return next()
  if (!req.restaurantOrgContext?.isOrgOwner) {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Org Owner role required' },
      requestId: req.requestId,
    })
  }
  next()
}

async function listBranchesForRequest(req) {
  const orgId = req.restaurantOrgContext?.organizationId
  if (!orgId) return []
  if (req.userData.role === 'ADMIN' && getEffectiveTenant(req)) {
    return listRestaurantOrgBranches(orgId)
  }
  return listRestaurantOrgBranchesForUser(req.userData.id, orgId)
}

async function assertRestaurantBranchAccess(req, restaurantId) {
  if (req.userData?.role === 'ADMIN') return true
  if (!req.restaurantOrgContext?.organizationId) return false
  return userHasRestaurantOrgBranchAccess(
    req.userData.id,
    restaurantId,
    req.restaurantOrgContext.organizationId
  )
}

router.use(
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  resolveTenantContext,
  requireRestaurantOrgContext,
  orgStructureGuard
)

router.get('/', async (req, res) => {
  try {
    if (!req.restaurantOrgContext?.organizationId) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Organization not found' },
        requestId: req.requestId,
      })
    }

    const branches = await listBranchesForRequest(req)

    res.json({
      ok: true,
      data: {
        organization: {
          id: req.restaurantOrgContext.organizationId,
          name: req.restaurantOrgContext.organizationName,
        },
        orgRole: req.restaurantOrgContext.roleName,
        branches,
        primaryRestaurantId: req.restaurantOrgContext.primaryRestaurantId,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET /api/restaurant-org error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load organization' },
      requestId: req.requestId,
    })
  }
})

router.get('/branches', async (req, res) => {
  try {
    if (!req.restaurantOrgContext?.organizationId) {
      const activeRestaurantId = await getRestaurantIdForRequest(req)
      return res.json({
        ok: true,
        data: {
          branches: [],
          activeRestaurantId: activeRestaurantId || null,
          organizationId: null,
        },
        error: null,
        requestId: req.requestId,
      })
    }

    const branches = await listBranchesForRequest(req)

    const activeRestaurantId =
      req.activeTenantContext?.tenantId ||
      (await getRestaurantIdForRequest(req)) ||
      req.restaurantOrgContext.primaryRestaurantId

    res.json({
      ok: true,
      data: {
        branches,
        activeRestaurantId,
        organizationId: req.restaurantOrgContext.organizationId,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET /api/restaurant-org/branches error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list branches' },
      requestId: req.requestId,
    })
  }
})

router.post('/branches', requireRestaurantOrgOwner, multiBranchFeature, async (req, res) => {
  try {
    const parentId = req.restaurantOrgContext.primaryRestaurantId
    if (!parentId || !req.restaurantOrgContext.organizationId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'BAD_REQUEST', message: 'Organization context required' },
        requestId: req.requestId,
      })
    }

    const limitCheck = await checkLinkedAccountLimit(parentId, 'RESTAURANT')
    if (!limitCheck.allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'LIMIT_EXCEEDED',
          message: limitCheck.reason,
          details: {
            limitKey: 'branches',
            action: limitCheck.action,
            includedLimit: limitCheck.includedLimit,
            addonQuantity: limitCheck.addonQuantity,
            effectiveLimit: limitCheck.effectiveLimit,
            current: limitCheck.current,
            upgradeUrl: '/app/settings?tab=subscription',
          },
        },
        requestId: req.requestId,
      })
    }

    const { name, branchName, branch_code, phone, address, contact_phone } = req.body
    const resolvedName = name || branchName
    if (!resolvedName) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Branch name is required' },
        requestId: req.requestId,
      })
    }

    const branch = await createRestaurantOrgBranch({
      organizationId: req.restaurantOrgContext.organizationId,
      branchName: resolvedName,
      branchCode: branch_code || null,
      phone: phone || contact_phone || null,
      address: typeof address === 'string' ? { street: address } : address || null,
      ownerUserId: req.userData.id,
      ownerEmail: req.userData.email,
    })

    await invalidateRestaurantOrgPermissionCaches(
      req.userData.id,
      req.restaurantOrgContext.organizationId
    )

    await createAuditLog('CREATE_RESTAURANT_ORG_BRANCH', {
      entityType: 'RESTAURANT',
      entityId: branch.id,
      description: `Created restaurant org branch: ${resolvedName}`,
      changes: {
        branchName: resolvedName,
        organizationId: req.restaurantOrgContext.organizationId,
      },
    })

    res.status(201).json({
      ok: true,
      data: { branch },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST /api/restaurant-org/branches error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to create branch' },
      requestId: req.requestId,
    })
  }
})

router.get('/branches/:restaurantId', async (req, res) => {
  try {
    const allowed = await assertRestaurantBranchAccess(req, req.params.restaurantId)
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Access denied for this branch' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(`SELECT * FROM restaurant WHERE id = $1`, [
      req.params.restaurantId,
    ])
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Branch not found' },
        requestId: req.requestId,
      })
    }

    res.json({ ok: true, data: { branch: rows[0] }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET /api/restaurant-org/branches/:id error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load branch' },
      requestId: req.requestId,
    })
  }
})

router.patch('/branches/:restaurantId', async (req, res) => {
  try {
    const restaurantId = req.params.restaurantId
    const allowed = await assertRestaurantBranchAccess(req, restaurantId)
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Access denied for this branch' },
        requestId: req.requestId,
      })
    }

    const canEdit =
      req.restaurantOrgContext.isOrgOwner ||
      req.restaurantOrgContext.roleName === 'Regional Manager' ||
      req.userData.role === 'ADMIN'
    if (!canEdit) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Cannot edit this branch' },
        requestId: req.requestId,
      })
    }

    const {
      name,
      branch_code,
      phone,
      address_json,
      deliveryLatitude,
      deliveryLongitude,
      deliveryLocationLabel,
      deliveryAddressNotes,
    } = req.body
    const updates = []
    const values = []
    let idx = 1
    if (name !== undefined) {
      updates.push(`name = $${idx++}`)
      values.push(name)
    }
    if (branch_code !== undefined) {
      updates.push(`branch_code = $${idx++}`)
      values.push(branch_code)
    }
    if (phone !== undefined) {
      updates.push(`phone = $${idx++}`)
      values.push(phone)
    }
    if (address_json !== undefined) {
      updates.push(`address_json = $${idx++}::jsonb`)
      values.push(JSON.stringify(address_json))
    }
    const hasDeliveryPatch =
      deliveryLatitude !== undefined ||
      deliveryLongitude !== undefined ||
      deliveryLocationLabel !== undefined ||
      deliveryAddressNotes !== undefined

    if (hasDeliveryPatch) {
      const { updateRestaurantDeliveryLocation } = await import(
        '../services/restaurant-delivery-location.service.js'
      )
      await updateRestaurantDeliveryLocation(restaurantId, {
        deliveryLatitude,
        deliveryLongitude,
        deliveryLocationLabel,
        deliveryAddressNotes,
      })
    }

    if (!updates.length && !hasDeliveryPatch) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'No fields to update' },
        requestId: req.requestId,
      })
    }

    if (!updates.length) {
      const { rows } = await query(`SELECT * FROM restaurant WHERE id = $1`, [restaurantId])
      return res.json({
        ok: true,
        data: { branch: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    }

    updates.push('updated_at = NOW()')
    values.push(restaurantId)
    const { rows } = await query(
      `UPDATE restaurant SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )

    res.json({ ok: true, data: { branch: rows[0] }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('PATCH /api/restaurant-org/branches/:id error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update branch' },
      requestId: req.requestId,
    })
  }
})

router.delete('/branches/:restaurantId', requireRestaurantOrgOwner, async (req, res) => {
  try {
    const result = await deactivateRestaurantOrgBranch(req.params.restaurantId)
    if (!result.ok) {
      const { deactivationBlockerMessage } = await import('../lib/branch-lifecycle-guards.js')
      const messages = {
        MAIN_BRANCH: 'Cannot deactivate the main Branch Account',
        PENDING_ORDERS: deactivationBlockerMessage('PENDING_ORDERS'),
        OPEN_INVOICES: deactivationBlockerMessage('OPEN_INVOICES'),
        SCHEDULED_STAFF: deactivationBlockerMessage('SCHEDULED_STAFF'),
        PENDING_CENTRAL_PURCHASING: deactivationBlockerMessage('PENDING_CENTRAL_PURCHASING'),
        NOT_FOUND: 'Branch Account not found',
      }
      return res.status(result.reason === 'NOT_FOUND' ? 404 : 403).json({
        ok: false,
        data: null,
        error: {
          name: result.reason,
          message: messages[result.reason] || 'Cannot deactivate Branch Account',
          details: result.blockers ? { blockers: result.blockers } : undefined,
        },
        requestId: req.requestId,
      })
    }

    if (req.restaurantOrgContext.organizationId) {
      await recordBranchAccountLinkHistory({
        orgType: 'RESTAURANT',
        organizationId: req.restaurantOrgContext.organizationId,
        tenantType: 'RESTAURANT',
        tenantId: req.params.restaurantId,
        action: 'deactivated',
        actorUserId: req.userData.id,
      })
    }

    await createAuditLog('DEACTIVATE_RESTAURANT_ORG_BRANCH', {
      entityType: 'RESTAURANT',
      entityId: req.params.restaurantId,
      description: 'Deactivated restaurant Branch Account',
    })

    res.json({
      ok: true,
      data: { deactivated: true, restaurantId: req.params.restaurantId },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('DELETE /api/restaurant-org/branches/:id error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to deactivate Branch Account' },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/branches/:restaurantId/reactivate',
  requireRestaurantOrgOwner,
  multiBranchFeature,
  async (req, res) => {
    try {
      const parentId = req.restaurantOrgContext.primaryRestaurantId
      const limitCheck = await checkLinkedAccountLimit(parentId, 'RESTAURANT')
      if (!limitCheck.allowed) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'LIMIT_EXCEEDED',
            message: limitCheck.reason,
            details: limitCheck,
          },
          requestId: req.requestId,
        })
      }

      const result = await reactivateRestaurantOrgBranch(req.params.restaurantId)
      if (!result.ok) {
        const messages = {
          NOT_FOUND: 'Branch Account not found',
          DETACHED: 'Branch Account is not attached to an organization',
          ALREADY_ACTIVE: 'Branch Account is already active',
        }
        return res.status(result.reason === 'NOT_FOUND' ? 404 : 400).json({
          ok: false,
          data: null,
          error: {
            name: result.reason,
            message: messages[result.reason] || 'Cannot reactivate Branch Account',
          },
          requestId: req.requestId,
        })
      }

      await recordBranchAccountLinkHistory({
        orgType: 'RESTAURANT',
        organizationId: result.organizationId,
        tenantType: 'RESTAURANT',
        tenantId: req.params.restaurantId,
        action: 'reactivated',
        actorUserId: req.userData.id,
      })

      await createAuditLog('REACTIVATE_RESTAURANT_ORG_BRANCH', {
        entityType: 'RESTAURANT',
        entityId: req.params.restaurantId,
        description: 'Reactivated restaurant Branch Account',
      })

      res.json({
        ok: true,
        data: { reactivated: true, restaurantId: req.params.restaurantId },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('POST restaurant-org reactivate error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to reactivate Branch Account' },
        requestId: req.requestId,
      })
    }
  }
)

router.post('/branches/:restaurantId/unlink', requireRestaurantOrgOwner, async (req, res) => {
  try {
    const { confirm } = req.body || {}
    if (confirm !== true && confirm !== 'unlink') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'CONFIRMATION_REQUIRED',
          message: 'Pass confirm: true to unlink this Branch Account',
        },
        requestId: req.requestId,
      })
    }

    const result = await withTransaction(async (client) => {
      const unlinked = await unlinkRestaurantFromOrganization(req.params.restaurantId, { client })
      if (!unlinked.ok) return unlinked

      const billing = await applyOrgBillingOnUnlink(req.params.restaurantId, 'RESTAURANT', {
        client,
        requireIndependentSubscription: true,
      })
      if (!billing.ok) {
        const err = new Error(billing.message || billing.reason)
        err.code = billing.reason
        throw err
      }

      await recordBranchAccountLinkHistory({
        orgType: 'RESTAURANT',
        organizationId: unlinked.organizationId,
        tenantType: 'RESTAURANT',
        tenantId: req.params.restaurantId,
        action: 'unlinked',
        actorUserId: req.userData.id,
        metadata: { billing },
        client,
      })

      return unlinked
    })

    if (!result.ok) {
      const messages = {
        NOT_FOUND: 'Branch Account not found',
        MAIN_BRANCH: 'Cannot unlink the main Branch Account',
        DETACHED: 'Branch Account is already detached',
      }
      return res.status(result.reason === 'NOT_FOUND' ? 404 : 400).json({
        ok: false,
        data: null,
        error: {
          name: result.reason,
          message: messages[result.reason] || 'Cannot unlink Branch Account',
        },
        requestId: req.requestId,
      })
    }

    if (result.organizationId) {
      const { invalidateCachesForRestaurantBranchLifecycle } = await import(
        '../lib/branch-lifecycle-guards.js'
      )
      await invalidateCachesForRestaurantBranchLifecycle(
        req.params.restaurantId,
        result.organizationId
      )
    }

    await createAuditLog('UNLINK_RESTAURANT_ORG_BRANCH', {
      entityType: 'RESTAURANT',
      entityId: req.params.restaurantId,
      description: 'Unlinked restaurant Branch Account from organization',
    })

    res.json({
      ok: true,
      data: { unlinked: true, restaurantId: req.params.restaurantId },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST restaurant-org unlink error:', error)
    const status =
      error.code === 'NO_INDEPENDENT_SUBSCRIPTION' || error.code === 'INVALID_SUBSCRIPTION'
        ? 403
        : 500
    res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Failed to unlink Branch Account',
      },
      requestId: req.requestId,
    })
  }
})

router.get('/link-invitations', requireRestaurantOrgOwner, async (req, res) => {
  try {
    const invitations = await listBranchAccountLinkInvitations(
      'RESTAURANT',
      req.restaurantOrgContext.organizationId
    )
    res.json({ ok: true, data: { invitations }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET restaurant-org link-invitations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list link invitations' },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/link-invitations',
  requireRestaurantOrgOwner,
  multiBranchFeature,
  async (req, res) => {
    try {
      const { target_tenant_id, target_owner_email, intended_org_role } = req.body || {}
      const created = await createBranchAccountLinkInvitation({
        orgType: 'RESTAURANT',
        organizationId: req.restaurantOrgContext.organizationId,
        primaryBillingTenantId: req.restaurantOrgContext.primaryRestaurantId,
        inviterUserId: req.userData.id,
        targetTenantId: target_tenant_id || null,
        targetOwnerEmail: target_owner_email || null,
        intendedOrgRole: intended_org_role || 'Branch Manager',
      })
      res.status(201).json({
        ok: true,
        data: {
          invitation: created.invitation,
          invite_url: created.invite_url,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('POST restaurant-org link-invitations error:', error)
      const status =
        error.code === 'LIMIT_EXCEEDED'
          ? 403
          : error.code === 'ALREADY_LINKED' || error.code === 'NOT_FOUND'
            ? 400
            : 500
      res.status(status).json({
        ok: false,
        data: null,
        error: {
          name: error.code || 'INTERNAL_ERROR',
          message: error.message || 'Failed to create link invitation',
          details: error.details,
        },
        requestId: req.requestId,
      })
    }
  }
)

router.delete('/link-invitations/:id', requireRestaurantOrgOwner, async (req, res) => {
  try {
    const invitation = await cancelBranchAccountLinkInvitation(
      req.params.id,
      'RESTAURANT',
      req.restaurantOrgContext.organizationId
    )
    if (!invitation) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Invitation not found or not cancellable' },
        requestId: req.requestId,
      })
    }
    res.json({ ok: true, data: { cancelled: true }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('DELETE restaurant-org link-invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to cancel invitation' },
      requestId: req.requestId,
    })
  }
})

router.post('/link-invitations/:id/resend', requireRestaurantOrgOwner, async (req, res) => {
  try {
    const result = await resendBranchAccountLinkInvitation(
      req.params.id,
      'RESTAURANT',
      req.restaurantOrgContext.organizationId
    )
    if (!result) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Invitation not found' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: { invitation: result.invitation, invite_url: result.invite_url },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST restaurant-org link-invitation resend error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to resend invitation' },
      requestId: req.requestId,
    })
  }
})

router.get('/users', requireRestaurantOrgOwner, async (req, res) => {
  try {
    const orgId = req.restaurantOrgContext.organizationId
    const { rows } = await query(
      `
      SELECT u.id, u.email, u.display_name, ror.name AS org_role,
             COALESCE(
               (SELECT json_agg(json_build_object('restaurantId', r.id, 'name', r.name))
                FROM restaurant_org_user_branch_access rouba
                JOIN restaurant r ON r.id = rouba.restaurant_id
                WHERE rouba.user_id = u.id AND rouba.organization_id = $1),
               '[]'::json
             ) AS branch_assignments
      FROM restaurant_org_user_roles rour
      JOIN app_user u ON u.id = rour.user_id
      JOIN restaurant_org_roles ror ON ror.id = rour.role_id
      WHERE rour.organization_id = $1
      ORDER BY u.display_name, u.email
    `,
      [orgId]
    )
    res.json({ ok: true, data: { users: rows }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET /api/restaurant-org/users error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list org users' },
      requestId: req.requestId,
    })
  }
})

router.post('/users/:userId/branches', requireRestaurantOrgOwner, async (req, res) => {
  try {
    const { restaurantId } = req.body
    if (!restaurantId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'restaurantId is required' },
        requestId: req.requestId,
      })
    }
    await grantRestaurantOrgBranchAccess({
      userId: req.params.userId,
      restaurantId,
      organizationId: req.restaurantOrgContext.organizationId,
      grantedBy: req.userData.id,
    })
    res
      .status(201)
      .json({ ok: true, data: { granted: true }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('POST restaurant-org user branch access error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to grant branch access' },
      requestId: req.requestId,
    })
  }
})

router.delete(
  '/users/:userId/branches/:restaurantId',
  requireRestaurantOrgOwner,
  async (req, res) => {
    try {
      await revokeRestaurantOrgBranchAccess(req.params.userId, req.params.restaurantId)
      res.json({ ok: true, data: { revoked: true }, error: null, requestId: req.requestId })
    } catch (error) {
      logger.error('DELETE restaurant-org user branch access error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to revoke branch access' },
        requestId: req.requestId,
      })
    }
  }
)

router.post('/users/:userId/role', requireRestaurantOrgOwner, async (req, res) => {
  try {
    const { roleName } = req.body
    if (!roleName) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'roleName is required' },
        requestId: req.requestId,
      })
    }
    await assignRestaurantOrgUserRole({
      userId: req.params.userId,
      organizationId: req.restaurantOrgContext.organizationId,
      roleName,
      assignedBy: req.userData.id,
    })
    res.json({
      ok: true,
      data: { assigned: true, roleName },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST restaurant-org user role error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to assign role' },
      requestId: req.requestId,
    })
  }
})

router.post('/context/switch', async (req, res) => {
  try {
    const { restaurant_id: restaurantId, tenantId } = req.body
    const targetId = restaurantId || tenantId

    if (!targetId) {
      res.clearCookie(getActiveTenantCookieName(), {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
      })
      return res.json({
        ok: true,
        data: { activeRestaurantId: null, cleared: true },
        error: null,
        requestId: req.requestId,
      })
    }

    const allowed =
      (await assertRestaurantBranchAccess(req, targetId)) &&
      (await userCanAccessTenant(req.userData.id, req.userData.email, targetId, 'RESTAURANT')) &&
      (await isTenantBranchActive(targetId, 'RESTAURANT'))
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'You do not have access to this Branch Account (inactive or unauthorized)',
        },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `SELECT id, name, is_branch_active FROM restaurant WHERE id = $1`,
      [targetId]
    )
    if (!rows.length || rows[0].is_branch_active === false) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Branch Account not found or inactive' },
        requestId: req.requestId,
      })
    }

    const { invalidateUserPermissionCache } = await import('../lib/permissions.js')
    await invalidateUserPermissionCache(req.userData.id, targetId, 'RESTAURANT')

    const token = await createActiveTenantToken({
      userId: req.userData.id,
      tenantId: targetId,
      tenantType: 'RESTAURANT',
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
      data: { activeRestaurantId: targetId, tenantName: rows[0].name },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST /api/restaurant-org/context/switch error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to switch Branch Account context' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/restaurant-org/reports/overview — consolidated KPIs across authorized Branch Accounts.
 */
router.get('/reports/overview', async (req, res) => {
  try {
    const result = await restaurantOrgConsolidatedOverview(
      req.userData.id,
      req.restaurantOrgContext.organizationId,
      req.query
    )
    res.json({ ok: true, ...result, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET /api/restaurant-org/reports/overview error:', error)
    const status = error.statusCode || error.status || 500
    res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Failed to load org reports',
      },
      requestId: req.requestId,
    })
  }
})

/**
 * Central purchasing foundation (Restaurant Scale only).
 * Drafts are per destination Branch Account — no organization-owned orders.
 */
router.get('/central-purchasing/branches', async (req, res) => {
  try {
    await assertCentralPurchasingEnabled(req.restaurantOrgContext.primaryRestaurantId)
    const branches = await listCentralPurchasingBranchAccounts(
      req.userData.id,
      req.restaurantOrgContext.organizationId
    )
    res.json({
      ok: true,
      data: { branches, foundationOnly: true },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET restaurant-org central-purchasing/branches error:', error)
    const status = error.statusCode || 500
    res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Failed to list central purchasing branches',
      },
      requestId: req.requestId,
    })
  }
})

router.get('/central-purchasing/drafts', async (req, res) => {
  try {
    await assertCentralPurchasingEnabled(req.restaurantOrgContext.primaryRestaurantId)
    const drafts = await listCentralPurchasingDrafts(
      req.userData.id,
      req.restaurantOrgContext.organizationId
    )
    res.json({
      ok: true,
      data: { drafts, foundationOnly: true },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET restaurant-org central-purchasing/drafts error:', error)
    const status = error.statusCode || 500
    res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Failed to list drafts',
      },
      requestId: req.requestId,
    })
  }
})

router.post('/central-purchasing/drafts', async (req, res) => {
  try {
    await assertCentralPurchasingEnabled(req.restaurantOrgContext.primaryRestaurantId)
    const destinationRestaurantId =
      req.body?.destination_restaurant_id || req.body?.destinationRestaurantId
    if (!destinationRestaurantId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'destination_restaurant_id is required',
        },
        requestId: req.requestId,
      })
    }
    const branches = await listCentralPurchasingBranchAccounts(
      req.userData.id,
      req.restaurantOrgContext.organizationId
    )
    if (!branches.some((b) => b.id === destinationRestaurantId)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Destination Branch Account is not authorized',
        },
        requestId: req.requestId,
      })
    }
    const draft = await getOrCreateCentralPurchasingDraft({
      organizationId: req.restaurantOrgContext.organizationId,
      destinationRestaurantId,
      userId: req.userData.id,
    })
    res.status(201).json({
      ok: true,
      data: { draft, foundationOnly: true },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST restaurant-org central-purchasing/drafts error:', error)
    const status = error.statusCode || 500
    res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Failed to create draft',
      },
      requestId: req.requestId,
    })
  }
})

router.patch('/central-purchasing/drafts/:draftId', async (req, res) => {
  try {
    await assertCentralPurchasingEnabled(req.restaurantOrgContext.primaryRestaurantId)
    const lineItems = req.body?.line_items ?? req.body?.lineItems
    if (!Array.isArray(lineItems)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'line_items array is required' },
        requestId: req.requestId,
      })
    }
    const draft = await updateCentralPurchasingDraftLines({
      draftId: req.params.draftId,
      userId: req.userData.id,
      organizationId: req.restaurantOrgContext.organizationId,
      lineItems,
    })
    if (!draft) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Draft not found' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: { draft, foundationOnly: true },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('PATCH restaurant-org central-purchasing/drafts error:', error)
    const status = error.statusCode || 500
    res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Failed to update draft',
      },
      requestId: req.requestId,
    })
  }
})

router.post('/central-purchasing/submit', async (req, res) => {
  try {
    await assertCentralPurchasingEnabled(req.restaurantOrgContext.primaryRestaurantId)
    const destinationIds =
      req.body?.destination_restaurant_ids || req.body?.destinationRestaurantIds || []
    if (!Array.isArray(destinationIds) || !destinationIds.length) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'destination_restaurant_ids array is required',
        },
        requestId: req.requestId,
      })
    }
    const authorized = await listCentralPurchasingBranchAccounts(
      req.userData.id,
      req.restaurantOrgContext.organizationId
    )
    const authorizedIds = new Set(authorized.map((b) => b.id))
    const filtered = destinationIds.filter((id) => authorizedIds.has(id))
    if (!filtered.length) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'No authorized destination Branch Accounts in request',
        },
        requestId: req.requestId,
      })
    }
    const result = await submitCentralPurchasingDrafts({
      userId: req.userData.id,
      organizationId: req.restaurantOrgContext.organizationId,
      destinationRestaurantIds: filtered,
    })
    res.json({
      ok: true,
      data: { ...result, foundationOnly: true },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST restaurant-org central-purchasing/submit error:', error)
    const status = error.statusCode || 500
    res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: error.code || 'INTERNAL_ERROR',
        message: error.message || 'Failed to submit central purchasing drafts',
      },
      requestId: req.requestId,
    })
  }
})

export default router
