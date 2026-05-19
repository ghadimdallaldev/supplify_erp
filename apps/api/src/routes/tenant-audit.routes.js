import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { formatAuditLogRow } from '../lib/audit.js'
import {
  buildAuditFilterOptions,
  AUDIT_ACTION_LABELS,
  AUDIT_RESOURCE_LABELS,
  getAuditActionLabel,
  getAuditResourceLabel,
} from '../lib/audit-labels.js'

const router = express.Router()

const listSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .default('50'),
  offset: z
    .string()
    .transform((v) => parseInt(v, 10))
    .default('0'),
})

function resolveTenant(req) {
  const ctx = req.tenantContext
  if (!ctx?.tenantId || !ctx?.tenantType) {
    throw new ValidationError('Tenant context required')
  }
  if (ctx.tenantType !== 'RESTAURANT' && ctx.tenantType !== 'SUPPLIER') {
    throw new ValidationError('Audit log is only available for restaurant or supplier tenants')
  }
  return { tenantId: ctx.tenantId, tenantType: ctx.tenantType }
}

function buildAuditQuery(tenant, filters) {
  const params = [tenant.tenantType, tenant.tenantId]
  const conditions = ['al.tenant_type = $1', 'al.tenant_id = $2']

  if (filters.userId) {
    params.push(filters.userId)
    conditions.push(`al.actor_user_id = $${params.length}`)
  }
  if (filters.action) {
    params.push(filters.action)
    conditions.push(`al.action_type = $${params.length}`)
  }
  if (filters.resourceType) {
    params.push(filters.resourceType)
    conditions.push(`(al.payload_json->>'resource_type') = $${params.length}`)
  }
  if (filters.from) {
    params.push(filters.from)
    conditions.push(`al.created_at >= $${params.length}::date`)
  }
  if (filters.to) {
    params.push(filters.to)
    conditions.push(`al.created_at < ($${params.length}::date + interval '1 day')`)
  }

  return { where: conditions.join(' AND '), params }
}

router.use(requireAuth, resolveTenantContext, requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']))

router.get('/logs/filters', requirePermission('SETTINGS_VIEW'), async (req, res, next) => {
  try {
    const tenant = resolveTenant(req)
    const { rows: actionRows } = await query(
      `SELECT DISTINCT action_type FROM audit_logs
       WHERE tenant_type = $1 AND tenant_id = $2
       ORDER BY action_type`,
      [tenant.tenantType, tenant.tenantId]
    )
    const { rows: resourceRows } = await query(
      `SELECT DISTINCT payload_json->>'resource_type' AS resource_type
       FROM audit_logs
       WHERE tenant_type = $1 AND tenant_id = $2
         AND payload_json->>'resource_type' IS NOT NULL
       ORDER BY 1`,
      [tenant.tenantType, tenant.tenantId]
    )

    const actions = buildAuditFilterOptions(
      actionRows.map((r) => r.action_type),
      AUDIT_ACTION_LABELS,
      getAuditActionLabel
    )
    const resourceTypes = buildAuditFilterOptions(
      resourceRows.map((r) => r.resource_type),
      AUDIT_RESOURCE_LABELS,
      getAuditResourceLabel
    )

    res.json({
      ok: true,
      data: { actions, resourceTypes },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/logs', requirePermission('SETTINGS_VIEW'), async (req, res, next) => {
  try {
    const tenant = resolveTenant(req)
    const filters = listSchema.parse(req.query)
    const { where, params } = buildAuditQuery(tenant, filters)
    const limit = Math.min(filters.limit, 200)
    const offset = filters.offset

    const countParams = [...params]
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM audit_logs al WHERE ${where}`,
      countParams
    )

    params.push(limit, offset)
    const { rows } = await query(
      `
      SELECT al.*, u.email AS user_email,
        COALESCE(u.display_name, u.email) AS user_name
      FROM audit_logs al
      LEFT JOIN app_user u ON u.id = al.actor_user_id
      WHERE ${where}
      ORDER BY al.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    )

    res.json({
      ok: true,
      data: {
        logs: rows.map(formatAuditLogRow),
        total: countRows[0]?.total ?? 0,
        limit,
        offset,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/logs/export', requirePermission('SETTINGS_MANAGE'), async (req, res, next) => {
  try {
    const tenant = resolveTenant(req)
    const filters = listSchema.parse(req.query)
    const { where, params } = buildAuditQuery(tenant, filters)

    const { rows } = await query(
      `
      SELECT al.*, u.email AS user_email,
        COALESCE(u.display_name, u.email) AS user_name
      FROM audit_logs al
      LEFT JOIN app_user u ON u.id = al.actor_user_id
      WHERE ${where}
      ORDER BY al.created_at DESC
      LIMIT 5000
      `,
      params
    )

    const header =
      'id,created_at,action,resource_type,resource_id,user_name,user_email,ip_address,metadata'
    const lines = rows.map((row) => {
      const entry = formatAuditLogRow(row)
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
      return [
        entry.id,
        entry.created_at,
        entry.action,
        entry.resource_type,
        entry.resource_id,
        entry.user_name,
        entry.user_email,
        entry.ip_address,
        JSON.stringify(entry.metadata),
      ]
        .map(esc)
        .join(',')
    })

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"')
    res.send([header, ...lines].join('\n'))
  } catch (err) {
    next(err)
  }
})

export { router as tenantAuditRoutes }
