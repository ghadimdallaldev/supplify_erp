import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { orgStructureGuard } from '../lib/route-permissions.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { checkLinkedAccountLimit, createAuditLog } from '../lib/plan-enforcement.js'
import {
  getUserRestaurantOrgMembership,
  listRestaurantOrgBranchesForUser,
  createRestaurantOrgBranch,
  deactivateRestaurantOrgBranch,
  assignRestaurantOrgUserRole,
  grantRestaurantOrgBranchAccess,
  revokeRestaurantOrgBranchAccess,
  userHasRestaurantOrgBranchAccess,
} from '../lib/restaurant-org.js'
import { createActiveTenantToken, getActiveTenantCookieName } from '../lib/tenant-switch.js'
import { config } from '../config/env.js'

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
  if (!membership && req.userData.role !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'No organization membership' },
      requestId: req.requestId,
    })
  }

  let organizationId = membership?.organization_id
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
  } else if (req.userData.role === 'RESTAURANT') {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (restaurantId) {
      const { rows } = await query(`SELECT organization_id FROM restaurant WHERE id = $1`, [
        restaurantId,
      ])
      organizationId = rows[0]?.organization_id
      primaryRestaurantId = restaurantId
    }
  }

  req.restaurantOrgContext = {
    organizationId,
    organizationName: membership?.organization_name || '',
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

    const branches = await listRestaurantOrgBranchesForUser(
      req.userData.id,
      req.restaurantOrgContext.organizationId
    )

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
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Organization not found' },
        requestId: req.requestId,
      })
    }

    const branches = await listRestaurantOrgBranchesForUser(
      req.userData.id,
      req.restaurantOrgContext.organizationId
    )

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
    })

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

    const { name, branch_code, phone, address_json } = req.body
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
    if (!updates.length) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'No fields to update' },
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
      const messages = {
        MAIN_BRANCH: 'Cannot deactivate the main branch',
        PENDING_ORDERS: 'Branch has pending orders and cannot be deactivated',
        NOT_FOUND: 'Branch not found',
      }
      return res.status(result.reason === 'NOT_FOUND' ? 404 : 403).json({
        ok: false,
        data: null,
        error: {
          name: result.reason,
          message: messages[result.reason] || 'Cannot deactivate branch',
        },
        requestId: req.requestId,
      })
    }

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
      error: { name: 'INTERNAL_ERROR', message: 'Failed to deactivate branch' },
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

    const allowed = await assertRestaurantBranchAccess(req, targetId)
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'You do not have access to this branch' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(`SELECT id, name FROM restaurant WHERE id = $1`, [targetId])
    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Branch not found' },
        requestId: req.requestId,
      })
    }

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
      error: { name: 'INTERNAL_ERROR', message: 'Failed to switch branch context' },
      requestId: req.requestId,
    })
  }
})

export default router
