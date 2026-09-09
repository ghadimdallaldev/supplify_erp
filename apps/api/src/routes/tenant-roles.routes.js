import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  requireAnyPermission,
} from '../lib/rbac.js'
import { assertTenantUserSeatAvailable, requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import {
  ensureTenantSystemRoles,
  RESERVED_SYSTEM_ROLE_NAMES,
  getAllPermissionsForTenantType,
  assignTenantUserRole,
} from '../lib/tenant-roles.js'
import { invalidateUserAuthCaches } from '../lib/access-cache.js'
import { resolveWorkspaceScope } from '../lib/workspace-membership.js'
import { assertCanAssignRole, assertCanGrantPermissions } from '../lib/rbac-guards.js'
import { MAIN_ADMIN_ROLE_NAME } from '../lib/workspace-membership.js'
import { syncDriverLinkForRoleAssignment } from '../lib/driver-user-link.js'
import {
  invalidateDriverLoginPolicyCache,
  syncDriverLoginPolicyForUser,
} from '../lib/driver-login-policy.js'
import { sendTemplateEmail } from '../services/email/email.service.js'
import { buildAppUrl } from '../lib/app-url.js'

const router = express.Router()

const advancedRolesFeature = requireFeature(
  'advanced_roles',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

async function seedRolesIfFeatureEnabled(req, res, next) {
  const tenant = req.tenantContext
  if (!tenant?.tenantId) return next()
  try {
    await ensureTenantSystemRoles(tenant.tenantId, tenant.tenantType)
  } catch (err) {
    logger.warn('ensureTenantSystemRoles on feature gate failed', { error: err.message })
  }
  next()
}

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  advancedRolesFeature,
  seedRolesIfFeatureEnabled
)

function assertTenantAccess(req) {
  const tenant = req.tenantContext
  if (!tenant?.tenantId) {
    throw new NotFoundError('Tenant context required')
  }
  return tenant
}

const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  permissions: z.array(z.string()).min(1),
})

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  permissions: z.array(z.string()).optional(),
})

const assignRoleSchema = z.object({
  role_id: z.string().uuid(),
  driver_id: z.string().uuid().optional().nullable(),
  create_driver_profile: z.boolean().optional(),
})

/** GET /api/roles */
router.get('/', requirePermission('SETTINGS_VIEW'), async (req, res) => {
  try {
    const { tenantId, tenantType } = assertTenantAccess(req)
    const { rows } = await query(
      `
      SELECT tr.*,
        COALESCE(
          (SELECT array_agg(trp.permission ORDER BY trp.permission)
           FROM tenant_role_permissions trp WHERE trp.role_id = tr.id),
          '{}'
        ) AS permissions,
        (SELECT COUNT(*)::int FROM tenant_user_roles tur WHERE tur.role_id = tr.id) AS user_count
      FROM tenant_roles tr
      WHERE tr.tenant_id = $1 AND tr.tenant_type = $2 AND tr.is_active = true
      ORDER BY tr.is_system DESC, tr.name ASC
    `,
      [tenantId, tenantType]
    )
    res.json({ ok: true, data: { roles: rows }, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('List tenant roles error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list roles' },
      requestId: req.requestId,
    })
  }
})

/** POST /api/roles */
router.post('/', requirePermission('SETTINGS_MANAGE'), async (req, res) => {
  try {
    const { tenantId, tenantType } = assertTenantAccess(req)
    const data = createRoleSchema.parse(req.body)
    const name = data.name.trim()
    if (RESERVED_SYSTEM_ROLE_NAMES.some((r) => r.toLowerCase() === name.toLowerCase())) {
      throw new ValidationError('Role name is reserved for system roles')
    }
    const allowed = new Set(getAllPermissionsForTenantType(tenantType))
    const invalid = data.permissions.filter((p) => !allowed.has(p))
    if (invalid.length > 0) {
      throw new ValidationError(`Invalid permissions: ${invalid.join(', ')}`)
    }

    assertCanGrantPermissions(
      req.tenantContext?.permissions || [],
      data.permissions,
      req.userData.role === 'ADMIN'
    )

    const { rows } = await query(
      `INSERT INTO tenant_roles (tenant_type, tenant_id, name, description, is_system)
       VALUES ($1, $2, $3, $4, false)
       RETURNING *`,
      [tenantType, tenantId, name, data.description || null]
    )
    const role = rows[0]
    for (const permission of data.permissions) {
      await query(`INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, $2)`, [
        role.id,
        permission,
      ])
    }
    role.permissions = data.permissions
    role.user_count = 0
    res.status(201).json({ ok: true, data: { role }, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'CONFLICT', message: 'A role with this name already exists' },
        requestId: req.requestId,
      })
    }
    logger.error('Create tenant role error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to create role' },
      requestId: req.requestId,
    })
  }
})

/** PATCH /api/roles/:id */
router.patch('/:id', requirePermission('SETTINGS_MANAGE'), async (req, res) => {
  try {
    const { tenantId, tenantType } = assertTenantAccess(req)
    const data = updateRoleSchema.parse(req.body)
    const { rows: roleRows } = await query(
      `SELECT * FROM tenant_roles WHERE id = $1 AND tenant_id = $2 AND tenant_type = $3`,
      [req.params.id, tenantId, tenantType]
    )
    if (roleRows.length === 0) throw new NotFoundError('Role not found')
    const role = roleRows[0]

    if (role.is_system) {
      if (role.name === MAIN_ADMIN_ROLE_NAME && data.permissions) {
        throw new ValidationError('The Owner role always has full access and cannot be modified')
      }
      if (data.name && data.name !== role.name) {
        throw new ValidationError('System role names cannot be changed')
      }
      if (data.permissions) {
        throw new ValidationError('System role permissions cannot be changed')
      }
      if (data.description !== undefined) {
        await query(`UPDATE tenant_roles SET description = $1, updated_at = NOW() WHERE id = $2`, [
          data.description,
          role.id,
        ])
      }
    } else {
      if (data.name) {
        const name = data.name.trim()
        if (RESERVED_SYSTEM_ROLE_NAMES.some((r) => r.toLowerCase() === name.toLowerCase())) {
          throw new ValidationError('Role name is reserved for system roles')
        }
        await query(`UPDATE tenant_roles SET name = $1, updated_at = NOW() WHERE id = $2`, [
          name,
          role.id,
        ])
      }
      if (data.description !== undefined) {
        await query(`UPDATE tenant_roles SET description = $1, updated_at = NOW() WHERE id = $2`, [
          data.description,
          role.id,
        ])
      }
      if (data.permissions) {
        const allowed = new Set(getAllPermissionsForTenantType(tenantType))
        const invalid = data.permissions.filter((p) => !allowed.has(p))
        if (invalid.length > 0) {
          throw new ValidationError(`Invalid permissions: ${invalid.join(', ')}`)
        }
        assertCanGrantPermissions(
          req.tenantContext?.permissions || [],
          data.permissions,
          req.userData.role === 'ADMIN'
        )
        await query(`DELETE FROM tenant_role_permissions WHERE role_id = $1`, [role.id])
        for (const permission of data.permissions) {
          await query(`INSERT INTO tenant_role_permissions (role_id, permission) VALUES ($1, $2)`, [
            role.id,
            permission,
          ])
        }
        const { rows: assigned } = await query(
          `SELECT user_id FROM tenant_user_roles WHERE role_id = $1`,
          [role.id]
        )
        for (const row of assigned) {
          await invalidateUserAuthCaches({
            userId: row.user_id,
            tenantId,
            tenantType,
          })
        }
      }
    }

    const { rows: updated } = await query(
      `
      SELECT tr.*,
        COALESCE(
          (SELECT array_agg(trp.permission ORDER BY trp.permission)
           FROM tenant_role_permissions trp WHERE trp.role_id = tr.id),
          '{}'
        ) AS permissions
      FROM tenant_roles tr WHERE tr.id = $1
    `,
      [role.id]
    )
    res.json({ ok: true, data: { role: updated[0] }, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return res.status(error instanceof NotFoundError ? 404 : 400).json({
        ok: false,
        data: null,
        error: {
          name: error instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_ERROR',
          message: error.message,
        },
        requestId: req.requestId,
      })
    }
    logger.error('Update tenant role error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update role' },
      requestId: req.requestId,
    })
  }
})

/** DELETE /api/roles/:id */
router.delete('/:id', requirePermission('SETTINGS_MANAGE'), async (req, res) => {
  try {
    const { tenantId, tenantType } = assertTenantAccess(req)
    const { rows: roleRows } = await query(
      `SELECT * FROM tenant_roles WHERE id = $1 AND tenant_id = $2 AND tenant_type = $3`,
      [req.params.id, tenantId, tenantType]
    )
    if (roleRows.length === 0) throw new NotFoundError('Role not found')
    const role = roleRows[0]
    if (role.is_system) {
      throw new ValidationError(
        role.name === MAIN_ADMIN_ROLE_NAME
          ? 'The Owner role cannot be deleted'
          : 'System roles cannot be deleted'
      )
    }

    const { rows: users } = await query(
      `
      SELECT u.id, u.email, u.display_name
      FROM tenant_user_roles tur
      JOIN app_user u ON u.id = tur.user_id
      WHERE tur.role_id = $1
    `,
      [role.id]
    )
    if (users.length > 0) {
      return res.status(409).json({
        ok: false,
        data: { users },
        error: {
          name: 'ROLE_IN_USE',
          message: 'Cannot delete role while users are assigned',
        },
        requestId: req.requestId,
      })
    }

    await query(`DELETE FROM tenant_roles WHERE id = $1`, [role.id])
    res.json({ ok: true, data: { deleted: true }, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return res.status(error instanceof NotFoundError ? 404 : 400).json({
        ok: false,
        data: null,
        error: {
          name: error instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_ERROR',
          message: error.message,
        },
        requestId: req.requestId,
      })
    }
    logger.error('Delete tenant role error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to delete role' },
      requestId: req.requestId,
    })
  }
})

/** GET /api/roles/users */
router.get('/users', requirePermission('SETTINGS_VIEW'), async (req, res) => {
  try {
    const { tenantId, tenantType } = assertTenantAccess(req)
    const contactTable = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
    const { rows } = await query(
      `
      SELECT DISTINCT ON (u.id)
        u.id,
        u.email,
        u.display_name,
        tr.id AS role_id,
        tr.name AS role_name,
        tr.is_system AS role_is_system
      FROM app_user u
      LEFT JOIN tenant_user_roles tur
        ON tur.user_id = u.id AND tur.tenant_id = $1 AND tur.tenant_type = $2
      LEFT JOIN tenant_roles tr ON tr.id = tur.role_id
      WHERE u.id IN (
        SELECT ur.user_id FROM user_role ur
        WHERE ur.tenant_id = $1 AND ur.tenant_type = $2
        UNION
        SELECT tur.user_id FROM tenant_user_roles tur
        WHERE tur.tenant_id = $1 AND tur.tenant_type = $2
        UNION
        SELECT au.id FROM app_user au
        JOIN ${contactTable} t ON LOWER(TRIM(t.contact_email)) = LOWER(TRIM(au.email))
        WHERE t.id = $1
      )
      ORDER BY u.id, u.display_name
    `,
      [tenantId, tenantType]
    )
    res.json({ ok: true, data: { users: rows }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('List tenant role users error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list users' },
      requestId: req.requestId,
    })
  }
})

/** POST /api/roles/users/:userId/assign */
router.post(
  '/users/:userId/assign',
  requireAnyPermission('STAFF_MANAGE', 'STAFF_INVITE', 'SETTINGS_MANAGE'),
  async (req, res) => {
    try {
      const { tenantId, tenantType } = assertTenantAccess(req)
      const body = assignRoleSchema.parse(req.body)
      const {
        role_id: roleId,
        driver_id: driverId,
        create_driver_profile: createDriverProfile,
      } = body
      const targetUserId = req.params.userId

      const scope = await resolveWorkspaceScope(tenantId, tenantType)
      const role = await assertCanAssignRole({
        requesterId: req.userData.id,
        requesterIsPlatformAdmin: req.userData.role === 'ADMIN',
        requesterPermissions: req.tenantContext?.permissions || [],
        targetUserId,
        roleId,
        tenantId,
        tenantType,
        organizationId: scope.organizationId,
      })

      await assertTenantUserSeatAvailable(tenantId, tenantType, {
        joiningUserId: targetUserId,
      })

      await assignTenantUserRole({
        userId: targetUserId,
        roleId,
        tenantId,
        tenantType,
        assignedBy: req.userData.id,
      })
      await invalidateUserAuthCaches({
        userId: targetUserId,
        tenantId,
        tenantType,
      })

      let driverLink = null
      if (tenantType === 'SUPPLIER') {
        driverLink = await syncDriverLinkForRoleAssignment({
          userId: targetUserId,
          supplierId: tenantId,
          roleName: role.name,
          driverId: driverId ?? undefined,
          createDriverProfile: createDriverProfile ?? true,
        })
        invalidateDriverLoginPolicyCache(targetUserId)
        void syncDriverLoginPolicyForUser(targetUserId)
      }

      const tenantTable = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
      const { rows: tenantRows } = await query(`SELECT name FROM ${tenantTable} WHERE id = $1`, [
        tenantId,
      ])
      const { rows: userRows } = await query(`SELECT email FROM app_user WHERE id = $1`, [
        targetUserId,
      ])
      const targetEmail = userRows[0]?.email
      if (targetEmail) {
        sendTemplateEmail({
          to: targetEmail,
          template: 'auth.role_changed',
          data: {
            tenantName: tenantRows[0]?.name || 'your workspace',
            roleName: role.name,
            ctaUrl: buildAppUrl('/app'),
          },
          tenantId,
          eventType: 'auth.role_changed',
          eventKey: `role_changed:${targetUserId}:${roleId}:${Date.now()}`,
          entityId: targetUserId,
        }).catch(() => {})
      }

      res.json({
        ok: true,
        data: {
          userId: targetUserId,
          roleId,
          roleName: role.name,
          driverId: driverLink?.id ?? null,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Invalid request body' },
          requestId: req.requestId,
        })
      }
      if (error.code === 'USER_LIMIT_REACHED') {
        return res.status(403).json({
          ok: false,

          data: null,

          error: { name: 'USER_LIMIT_REACHED', message: error.message, details: error.limitCheck },

          requestId: req.requestId,
        })
      }

      if (error instanceof ForbiddenError) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: error.message },
          requestId: req.requestId,
        })
      }
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        return res.status(error instanceof NotFoundError ? 404 : 400).json({
          ok: false,
          data: null,
          error: {
            name: error instanceof NotFoundError ? 'NOT_FOUND' : 'VALIDATION_ERROR',
            message: error.message,
          },
          requestId: req.requestId,
        })
      }
      logger.error('Assign tenant role error', { error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to assign role' },
        requestId: req.requestId,
      })
    }
  }
)

/** GET /api/roles/:id/permissions */
router.get('/:id/permissions', requirePermission('SETTINGS_VIEW'), async (req, res) => {
  try {
    const { tenantId, tenantType } = assertTenantAccess(req)
    const { rows: roleRows } = await query(
      `SELECT * FROM tenant_roles WHERE id = $1 AND tenant_id = $2 AND tenant_type = $3`,
      [req.params.id, tenantId, tenantType]
    )
    if (roleRows.length === 0) throw new NotFoundError('Role not found')
    const role = roleRows[0]

    const { rows: assigned } = await query(
      `SELECT permission FROM tenant_role_permissions WHERE role_id = $1`,
      [role.id]
    )
    const assignedSet = new Set(assigned.map((r) => r.permission))
    const allPermissions = getAllPermissionsForTenantType(tenantType).map((key) => ({
      key,
      assigned: assignedSet.has(key),
    }))

    res.json({
      ok: true,
      data: {
        role: { id: role.id, name: role.name, is_system: role.is_system },
        permissions: allPermissions,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Get role permissions error', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get role permissions' },
      requestId: req.requestId,
    })
  }
})

export { router as tenantRolesRoutes }
