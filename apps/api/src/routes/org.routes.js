import express from 'express'
import { requireAuth, requireRole, getSupplierIdForRequest } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { checkLinkedAccountLimit, createAuditLog } from '../lib/plan-enforcement.js'
import {
  getUserOrgMembership,
  listOrgBranchesForUser,
  createOrgBranch,
  deactivateOrgBranch,
  assignOrgUserRole,
  grantOrgBranchAccess,
  revokeOrgBranchAccess,
  userHasOrgBranchAccess,
} from '../lib/supplier-org.js'
import { createActiveTenantToken, getActiveTenantCookieName } from '../lib/tenant-switch.js'
import { config } from '../config/env.js'

const router = express.Router()

const multiBranchFeature = requireFeature(
  'multi_branch',
  (req) => req.orgContext?.primarySupplierId,
  () => 'SUPPLIER'
)

async function requireSupplierOrgContext(req, res, next) {
  if (req.userData?.role !== 'SUPPLIER' && req.userData?.role !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Supplier organization access required' },
      requestId: req.requestId,
    })
  }

  const membership = await getUserOrgMembership(req.userData.id)
  if (!membership && req.userData.role !== 'ADMIN') {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'No organization membership' },
      requestId: req.requestId,
    })
  }

  let organizationId = membership?.organization_id
  let primarySupplierId = null

  if (req.userData.role === 'ADMIN' && req.query.organization_id) {
    organizationId = req.query.organization_id
  }

  if (organizationId) {
    const { rows: mainRows } = await query(
      `SELECT id FROM supplier WHERE organization_id = $1 AND is_main_branch = true LIMIT 1`,
      [organizationId]
    )
    primarySupplierId = mainRows[0]?.id || null
    if (!primarySupplierId) {
      const { rows: anyBranch } = await query(
        `SELECT id FROM supplier WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [organizationId]
      )
      primarySupplierId = anyBranch[0]?.id || null
    }
  } else if (req.userData.role === 'SUPPLIER') {
    const supplierId = await getSupplierIdForRequest(req)
    if (supplierId) {
      const { rows } = await query(`SELECT organization_id FROM supplier WHERE id = $1`, [
        supplierId,
      ])
      organizationId = rows[0]?.organization_id
      primarySupplierId = supplierId
    }
  }

  req.orgContext = {
    organizationId,
    organizationName: membership?.organization_name || '',
    roleName: membership?.role_name || null,
    primarySupplierId,
    isOrgOwner: membership?.role_name === 'Org Owner',
    isOrgManager: membership?.role_name === 'Org Manager',
    canManageAllBranches:
      membership?.role_name === 'Org Owner' ||
      membership?.role_name === 'Org Manager' ||
      membership?.role_name === 'Org Viewer',
  }
  next()
}

function requireOrgOwner(req, res, next) {
  if (req.userData?.role === 'ADMIN') return next()
  if (!req.orgContext?.isOrgOwner) {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Org Owner role required' },
      requestId: req.requestId,
    })
  }
  next()
}

async function assertBranchAccess(req, supplierId) {
  if (req.userData?.role === 'ADMIN') return true
  if (!req.orgContext?.organizationId) return false
  return userHasOrgBranchAccess(req.userData.id, supplierId, req.orgContext.organizationId)
}

router.use(requireAuth, requireRole(['SUPPLIER', 'ADMIN']), requireSupplierOrgContext)

/**
 * GET /api/org
 */
router.get('/', async (req, res) => {
  try {
    if (!req.orgContext?.organizationId) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Organization not found' },
        requestId: req.requestId,
      })
    }

    const branches = await listOrgBranchesForUser(req.userData.id, req.orgContext.organizationId)

    res.json({
      ok: true,
      data: {
        organization: {
          id: req.orgContext.organizationId,
          name: req.orgContext.organizationName,
        },
        orgRole: req.orgContext.roleName,
        branches,
        primarySupplierId: req.orgContext.primarySupplierId,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET /api/org error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load organization' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/org/branches
 */
router.get('/branches', async (req, res) => {
  try {
    if (!req.orgContext?.organizationId) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Organization not found' },
        requestId: req.requestId,
      })
    }

    const branches = await listOrgBranchesForUser(req.userData.id, req.orgContext.organizationId)

    const activeSupplierId =
      req.activeTenantContext?.tenantId ||
      (await getSupplierIdForRequest(req)) ||
      req.orgContext.primarySupplierId

    res.json({
      ok: true,
      data: {
        branches,
        activeSupplierId,
        organizationId: req.orgContext.organizationId,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET /api/org/branches error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list branches' },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /api/org/branches
 */
router.post('/branches', requireOrgOwner, multiBranchFeature, async (req, res) => {
  try {
    const parentId = req.orgContext.primarySupplierId
    if (!parentId || !req.orgContext.organizationId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'BAD_REQUEST', message: 'Organization context required' },
        requestId: req.requestId,
      })
    }

    const limitCheck = await checkLinkedAccountLimit(parentId, 'SUPPLIER')
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

    const branch = await createOrgBranch({
      organizationId: req.orgContext.organizationId,
      branchName: resolvedName,
      branchCode: branch_code || null,
      phone: phone || contact_phone || null,
      address: typeof address === 'string' ? { street: address } : address || null,
      ownerUserId: req.userData.id,
      ownerEmail: req.userData.email,
    })

    await createAuditLog('CREATE_ORG_BRANCH', {
      entityType: 'SUPPLIER',
      entityId: branch.id,
      description: `Created org branch: ${resolvedName}`,
      changes: { branchName: resolvedName, organizationId: req.orgContext.organizationId },
    })

    res.status(201).json({
      ok: true,
      data: { branch },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST /api/org/branches error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to create branch' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/org/branches/:supplierId
 */
router.get('/branches/:supplierId', async (req, res) => {
  try {
    const allowed = await assertBranchAccess(req, req.params.supplierId)
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Access denied for this branch' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(`SELECT * FROM supplier WHERE id = $1`, [req.params.supplierId])
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
    logger.error('GET /api/org/branches/:id error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load branch' },
      requestId: req.requestId,
    })
  }
})

/**
 * PATCH /api/org/branches/:supplierId
 */
router.patch('/branches/:supplierId', async (req, res) => {
  try {
    const supplierId = req.params.supplierId
    const allowed = await assertBranchAccess(req, supplierId)
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Access denied for this branch' },
        requestId: req.requestId,
      })
    }

    const canEdit =
      req.orgContext.isOrgOwner ||
      req.orgContext.roleName === 'Regional Manager' ||
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
    values.push(supplierId)
    const { rows } = await query(
      `UPDATE supplier SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )

    res.json({ ok: true, data: { branch: rows[0] }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('PATCH /api/org/branches/:id error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update branch' },
      requestId: req.requestId,
    })
  }
})

/**
 * DELETE /api/org/branches/:supplierId — deactivate branch
 */
router.delete('/branches/:supplierId', requireOrgOwner, async (req, res) => {
  try {
    const result = await deactivateOrgBranch(req.params.supplierId)
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
      data: { deactivated: true, supplierId: req.params.supplierId },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('DELETE /api/org/branches/:id error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to deactivate branch' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/org/users
 */
router.get('/users', requireOrgOwner, async (req, res) => {
  try {
    const orgId = req.orgContext.organizationId
    const { rows } = await query(
      `
      SELECT u.id, u.email, u.display_name, orgr.name AS org_role,
             COALESCE(
               (SELECT json_agg(json_build_object('supplierId', s.id, 'name', s.name))
                FROM org_user_branch_access ouba
                JOIN supplier s ON s.id = ouba.supplier_id
                WHERE ouba.user_id = u.id AND ouba.organization_id = $1),
               '[]'::json
             ) AS branch_assignments
      FROM org_user_roles our
      JOIN app_user u ON u.id = our.user_id
      JOIN org_roles orgr ON orgr.id = our.role_id
      WHERE our.organization_id = $1
      ORDER BY u.display_name, u.email
    `,
      [orgId]
    )
    res.json({ ok: true, data: { users: rows }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET /api/org/users error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list org users' },
      requestId: req.requestId,
    })
  }
})

router.post('/users/:userId/branches', requireOrgOwner, async (req, res) => {
  try {
    const { supplierId } = req.body
    if (!supplierId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'supplierId is required' },
        requestId: req.requestId,
      })
    }
    await grantOrgBranchAccess({
      userId: req.params.userId,
      supplierId,
      organizationId: req.orgContext.organizationId,
      grantedBy: req.userData.id,
    })
    res
      .status(201)
      .json({ ok: true, data: { granted: true }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('POST org user branch access error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to grant branch access' },
      requestId: req.requestId,
    })
  }
})

router.delete('/users/:userId/branches/:supplierId', requireOrgOwner, async (req, res) => {
  try {
    await revokeOrgBranchAccess(req.params.userId, req.params.supplierId)
    res.json({ ok: true, data: { revoked: true }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('DELETE org user branch access error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to revoke branch access' },
      requestId: req.requestId,
    })
  }
})

router.post('/users/:userId/role', requireOrgOwner, async (req, res) => {
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
    await assignOrgUserRole({
      userId: req.params.userId,
      organizationId: req.orgContext.organizationId,
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
    logger.error('POST org user role error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to assign role' },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /api/org/context/switch
 */
router.post('/context/switch', async (req, res) => {
  try {
    const { supplier_id: supplierId, tenantId } = req.body
    const targetId = supplierId || tenantId

    if (!targetId) {
      res.clearCookie(getActiveTenantCookieName(), {
        path: '/',
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
      })
      return res.json({
        ok: true,
        data: { activeSupplierId: null, cleared: true },
        error: null,
        requestId: req.requestId,
      })
    }

    const allowed = await assertBranchAccess(req, targetId)
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'You do not have access to this branch' },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(`SELECT id, name FROM supplier WHERE id = $1`, [targetId])
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
      tenantType: 'SUPPLIER',
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
      data: { activeSupplierId: targetId, tenantName: rows[0].name },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST /api/org/context/switch error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to switch branch context' },
      requestId: req.requestId,
    })
  }
})

export default router
