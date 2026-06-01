import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requireAnyPermission,
} from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  assertSupplierInOrg,
  createBranchInvitation,
  listBranchInvitations,
  regenerateBranchInvitation,
  revokeBranchInvitation,
  validateBranchRoleForSupplier,
} from '../lib/branch-invitations.js'

const router = express.Router()

const multiBranchFeature = requireFeature(
  'multi_branch',
  (req) => req.orgContext?.primarySupplierId,
  () => 'SUPPLIER'
)

async function resolveOrgContextFromTenant(req, res, next) {
  if (req.userData?.role === 'ADMIN') {
    const orgId = req.query.organization_id || req.body?.organization_id
    if (orgId) {
      const { rows } = await query(
        `SELECT id FROM supplier WHERE organization_id = $1 AND is_main_branch = true LIMIT 1`,
        [orgId]
      )
      req.orgContext = {
        organizationId: orgId,
        primarySupplierId: rows[0]?.id || null,
      }
    }
    return next()
  }

  const tenantId = req.tenantContext?.tenantId
  if (!tenantId) {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Supplier context required' },
      requestId: req.requestId,
    })
  }

  const { rows } = await query(`SELECT organization_id FROM supplier WHERE id = $1`, [tenantId])
  const organizationId = rows[0]?.organization_id
  if (!organizationId) {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Organization context required for branch invitations' },
      requestId: req.requestId,
    })
  }

  const { rows: mainRows } = await query(
    `SELECT id FROM supplier WHERE organization_id = $1 AND is_main_branch = true LIMIT 1`,
    [organizationId]
  )

  req.orgContext = {
    organizationId,
    primarySupplierId: mainRows[0]?.id || null,
  }
  next()
}

router.use(
  requireAuth,
  requireRole(['SUPPLIER', 'ADMIN']),
  resolveTenantContext,
  requireAnyPermission('STAFF_MANAGE', 'STAFF_INVITE', 'SETTINGS_MANAGE'),
  resolveOrgContextFromTenant,
  multiBranchFeature
)

router.post('/', async (req, res) => {
  try {
    const {
      supplier_id: supplierId,
      invited_name: invitedName,
      invited_email: invitedEmail,
      role_id: roleId,
    } = req.body

    if (!supplierId || !roleId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'supplier_id and role_id are required' },
        requestId: req.requestId,
      })
    }

    if (!invitedEmail || !String(invitedEmail).trim()) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'invited_email is required' },
        requestId: req.requestId,
      })
    }

    const inOrg = await assertSupplierInOrg(supplierId, req.orgContext.organizationId)
    if (!inOrg) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Branch does not belong to this organization' },
        requestId: req.requestId,
      })
    }

    const validRole = await validateBranchRoleForSupplier(roleId, supplierId)
    if (!validRole) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid branch role' },
        requestId: req.requestId,
      })
    }

    const result = await createBranchInvitation({
      supplierId,
      organizationId: req.orgContext.organizationId,
      invitedBy: req.userData.id,
      invitedName,
      invitedEmail,
      roleId,
    })

    res.status(201).json({
      ok: true,
      data: {
        invitation_id: result.invitation.id,
        invite_url: result.invite_url,
        expires_at: result.expires_at,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST /api/org/invitations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to create invitation' },
      requestId: req.requestId,
    })
  }
})

router.get('/roles', async (req, res) => {
  try {
    const supplierId = req.query.supplier_id
    if (!supplierId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'supplier_id is required' },
        requestId: req.requestId,
      })
    }
    const inOrg = await assertSupplierInOrg(supplierId, req.orgContext.organizationId)
    if (!inOrg) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid branch' },
        requestId: req.requestId,
      })
    }
    const { rows } = await query(
      `
      SELECT id, name, description
      FROM tenant_roles
      WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER' AND is_system = true
        AND name != 'Owner'
      ORDER BY name ASC
      `,
      [supplierId]
    )
    res.json({ ok: true, data: { roles: rows }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET /api/org/invitations/roles error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list roles' },
      requestId: req.requestId,
    })
  }
})

router.get('/', async (req, res) => {
  try {
    const supplierId = req.query.supplier_id || null
    const invitations = await listBranchInvitations(req.orgContext.organizationId, {
      supplierId,
    })
    res.json({
      ok: true,
      data: { invitations },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET /api/org/invitations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list invitations' },
      requestId: req.requestId,
    })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const revoked = await revokeBranchInvitation(req.params.id, req.orgContext.organizationId)
    if (!revoked) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Pending invitation not found' },
        requestId: req.requestId,
      })
    }
    res.json({ ok: true, data: { revoked: true }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('DELETE /api/org/invitations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to revoke invitation' },
      requestId: req.requestId,
    })
  }
})

router.post('/:id/regenerate', async (req, res) => {
  try {
    const result = await regenerateBranchInvitation(req.params.id, req.orgContext.organizationId)
    if (!result) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Invitation not found or cannot be regenerated' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: {
        invitation_id: result.invitation.id,
        invite_url: result.invite_url,
        expires_at: result.expires_at,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('POST /api/org/invitations regenerate error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to regenerate invitation' },
      requestId: req.requestId,
    })
  }
})

export default router
