import express from 'express'
import { requireAuth, requireRole, requirePermission, getRestaurantIdForRequest } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { getUserRestaurantOrgMembership } from '../lib/restaurant-org.js'
import {
  assertRestaurantInOrg,
  createRestaurantMemberInvitation,
  createRestaurantBranchInvitation,
  listRestaurantMemberInvitations,
  listRestaurantBranchInvitations,
  regenerateRestaurantInvitation,
  revokeRestaurantInvitation,
  validateRestaurantRoleForBranch,
} from '../lib/restaurant-invitations.js'

const router = express.Router()

const multiBranchFeature = requireFeature(
  'multi_branch',
  async (req) => {
    const id = await getRestaurantIdForRequest(req)
    return id
  },
  () => 'RESTAURANT'
)

async function requireRestaurantOrgOwnerContext(req, res, next) {
  if (req.userData?.role === 'ADMIN') {
    const orgId = req.query.organization_id
    if (orgId) {
      const { rows } = await query(
        `SELECT id FROM restaurant WHERE organization_id = $1 AND is_main_branch = true LIMIT 1`,
        [orgId]
      )
      req.restaurantOrgContext = {
        organizationId: orgId,
        primaryRestaurantId: rows[0]?.id || null,
        isOrgOwner: true,
      }
    }
    return next()
  }

  const membership = await getUserRestaurantOrgMembership(req.userData.id)
  if (!membership || membership.role_name !== 'Org Owner') {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Org Owner role required' },
      requestId: req.requestId,
    })
  }

  const { rows: mainRows } = await query(
    `SELECT id FROM restaurant WHERE organization_id = $1 AND is_main_branch = true LIMIT 1`,
    [membership.organization_id]
  )

  req.restaurantOrgContext = {
    organizationId: membership.organization_id,
    primaryRestaurantId: mainRows[0]?.id || null,
    isOrgOwner: true,
  }
  next()
}

async function requireRestaurantBranchContext(req, res, next) {
  const restaurantId = await getRestaurantIdForRequest(req)
  if (!restaurantId) {
    return res.status(403).json({
      ok: false,
      data: null,
      error: { name: 'FORBIDDEN', message: 'Restaurant context required' },
      requestId: req.requestId,
    })
  }
  const { rows } = await query(
    `SELECT organization_id FROM restaurant WHERE id = $1`,
    [restaurantId]
  )
  req.restaurantBranchContext = {
    restaurantId,
    organizationId: rows[0]?.organization_id || null,
  }
  next()
}

const membersRouter = express.Router()
membersRouter.use(
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  requireRestaurantBranchContext,
  requirePermission('STAFF_MANAGE')
)

membersRouter.post('/', async (req, res) => {
  try {
    const { invited_name: invitedName, invited_email: invitedEmail, role_id: roleId } = req.body
    const { restaurantId, organizationId } = req.restaurantBranchContext

    if (!roleId || !organizationId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'role_id is required and restaurant must belong to an organization',
        },
        requestId: req.requestId,
      })
    }

    const validRole = await validateRestaurantRoleForBranch(roleId, restaurantId)
    if (!validRole) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid branch role' },
        requestId: req.requestId,
      })
    }

    const result = await createRestaurantMemberInvitation({
      restaurantId,
      organizationId,
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
    logger.error('POST restaurant member invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to create invitation' },
      requestId: req.requestId,
    })
  }
})

membersRouter.get('/', async (req, res) => {
  try {
    const invitations = await listRestaurantMemberInvitations(
      req.restaurantBranchContext.restaurantId
    )
    res.json({ ok: true, data: { invitations }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET restaurant member invitations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list invitations' },
      requestId: req.requestId,
    })
  }
})

membersRouter.get('/roles', async (req, res) => {
  try {
    const { restaurantId } = req.restaurantBranchContext
    const { rows } = await query(
      `
      SELECT id, name, description
      FROM tenant_roles
      WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND is_system = true
      ORDER BY name ASC
      `,
      [restaurantId]
    )
    res.json({ ok: true, data: { roles: rows }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET restaurant member invitation roles error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list roles' },
      requestId: req.requestId,
    })
  }
})

membersRouter.delete('/:id', async (req, res) => {
  try {
    const revoked = await revokeRestaurantInvitation(req.params.id, {
      restaurantId: req.restaurantBranchContext.restaurantId,
    })
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
    logger.error('DELETE restaurant member invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to revoke invitation' },
      requestId: req.requestId,
    })
  }
})

membersRouter.post('/:id/regenerate', async (req, res) => {
  try {
    const result = await regenerateRestaurantInvitation(req.params.id, {
      restaurantId: req.restaurantBranchContext.restaurantId,
    })
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
    logger.error('POST regenerate restaurant member invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to regenerate invitation' },
      requestId: req.requestId,
    })
  }
})

const branchesRouter = express.Router()
branchesRouter.use(
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  requireRestaurantOrgOwnerContext,
  multiBranchFeature
)

branchesRouter.post('/', async (req, res) => {
  try {
    const {
      restaurant_id: restaurantId,
      invited_name: invitedName,
      invited_email: invitedEmail,
      role_id: roleId,
    } = req.body

    if (!restaurantId || !roleId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'restaurant_id and role_id are required' },
        requestId: req.requestId,
      })
    }

    const inOrg = await assertRestaurantInOrg(restaurantId, req.restaurantOrgContext.organizationId)
    if (!inOrg) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Branch does not belong to this organization' },
        requestId: req.requestId,
      })
    }

    const validRole = await validateRestaurantRoleForBranch(roleId, restaurantId)
    if (!validRole) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid branch role' },
        requestId: req.requestId,
      })
    }

    const result = await createRestaurantBranchInvitation({
      restaurantId,
      organizationId: req.restaurantOrgContext.organizationId,
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
    logger.error('POST restaurant branch invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to create invitation' },
      requestId: req.requestId,
    })
  }
})

branchesRouter.get('/', async (req, res) => {
  try {
    const invitations = await listRestaurantBranchInvitations(
      req.restaurantOrgContext.organizationId
    )
    res.json({ ok: true, data: { invitations }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET restaurant branch invitations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list invitations' },
      requestId: req.requestId,
    })
  }
})

branchesRouter.get('/roles', async (req, res) => {
  try {
    const restaurantId = req.query.restaurant_id
    if (!restaurantId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'restaurant_id is required' },
        requestId: req.requestId,
      })
    }
    const inOrg = await assertRestaurantInOrg(restaurantId, req.restaurantOrgContext.organizationId)
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
      WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT' AND is_system = true
      ORDER BY name ASC
      `,
      [restaurantId]
    )
    res.json({ ok: true, data: { roles: rows }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET restaurant branch invitation roles error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list roles' },
      requestId: req.requestId,
    })
  }
})

branchesRouter.delete('/:id', async (req, res) => {
  try {
    const revoked = await revokeRestaurantInvitation(req.params.id, {
      organizationId: req.restaurantOrgContext.organizationId,
    })
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
    logger.error('DELETE restaurant branch invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to revoke invitation' },
      requestId: req.requestId,
    })
  }
})

branchesRouter.post('/:id/regenerate', async (req, res) => {
  try {
    const result = await regenerateRestaurantInvitation(req.params.id, {
      organizationId: req.restaurantOrgContext.organizationId,
    })
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
    logger.error('POST regenerate restaurant branch invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to regenerate invitation' },
      requestId: req.requestId,
    })
  }
})

router.use('/members', membersRouter)
router.use('/branches', branchesRouter)

export default router
