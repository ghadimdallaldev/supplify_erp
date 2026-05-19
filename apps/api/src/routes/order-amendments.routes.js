import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  resolveTenantContext,
  requirePermission,
  getRequestTenant,
} from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { writeAuditLog } from '../lib/audit.js'
import {
  getOrderForAmendment,
  assertNoPendingAmendment,
  canAmendOrderStatus,
  acceptAmendment,
  notifyAmendmentParty,
} from '../services/order-amendments.service.js'

const router = express.Router({ mergeParams: true })

const createSchema = z.object({
  changeType: z.enum([
    'quantity_change',
    'item_substitution',
    'item_removal',
    'delivery_date_change',
    'other',
  ]),
  description: z.string().min(1),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid().optional(),
        originalProductId: z.string().uuid().optional(),
        substituteProductId: z.string().uuid().optional(),
        originalQuantity: z.number().optional(),
        requestedQuantity: z.number().optional(),
        unitPrice: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
})

async function assertOrderAccess(req, orderId) {
  const order = await getOrderForAmendment(orderId)
  const tenant = await getRequestTenant(req)
  if (tenant?.tenantType === 'RESTAURANT' && order.restaurant_id !== tenant.tenantId) {
    throw new ValidationError('Access denied')
  }
  if (tenant?.tenantType === 'SUPPLIER' && order.supplier_id !== tenant.tenantId) {
    throw new ValidationError('Access denied')
  }
  return order
}

function resolveRequesterRole(req) {
  const tenant = req.tenantContext
  if (tenant?.tenantType === 'RESTAURANT') return 'restaurant'
  if (tenant?.tenantType === 'SUPPLIER') return 'supplier'
  if (req.userData?.role === 'RESTAURANT') return 'restaurant'
  if (req.userData?.role === 'SUPPLIER') return 'supplier'
  throw new ValidationError('Invalid role for amendments')
}

router.use(requireAuth, resolveTenantContext, requirePermission('ORDERS_VIEW'))

router.get('/', async (req, res, next) => {
  try {
    const orderId = req.params.orderId
    await assertOrderAccess(req, orderId)
    const { rows } = await query(
      `
      SELECT oa.*,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', oai.id,
            'orderItemId', oai.order_item_id,
            'originalProductId', oai.original_product_id,
            'substituteProductId', oai.substitute_product_id,
            'originalQuantity', oai.original_quantity,
            'requestedQuantity', oai.requested_quantity,
            'unitPrice', oai.unit_price,
            'notes', oai.notes
          ))
          FROM order_amendment_items oai WHERE oai.amendment_id = oa.id),
          '[]'::json
        ) AS items
      FROM order_amendments oa
      WHERE oa.order_id = $1
      ORDER BY oa.created_at DESC
      `,
      [orderId]
    )
    res.json({ ok: true, data: { amendments: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const orderId = req.params.orderId
    const order = await assertOrderAccess(req, orderId)
    if (!canAmendOrderStatus(order.status)) {
      throw new ValidationError('Order cannot be amended in its current status')
    }
    const body = createSchema.parse(req.body)
    const requestedByRole = resolveRequesterRole(req)

    const amendment = await withTransaction(async (client) => {
      await assertNoPendingAmendment(orderId, client)
      const { rows } = await client.query(
        `
        INSERT INTO order_amendments (
          order_id, requested_by_role, requested_by, change_type, description
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [orderId, requestedByRole, req.userData.id, body.changeType, body.description]
      )
      const created = rows[0]
      for (const item of body.items || []) {
        await client.query(
          `
          INSERT INTO order_amendment_items (
            amendment_id, order_item_id, original_product_id, substitute_product_id,
            original_quantity, requested_quantity, unit_price, notes
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            created.id,
            item.orderItemId ?? null,
            item.originalProductId ?? null,
            item.substituteProductId ?? null,
            item.originalQuantity ?? null,
            item.requestedQuantity ?? null,
            item.unitPrice ?? null,
            item.notes ?? null,
          ]
        )
      }
      return created
    })

    await notifyAmendmentParty(order, amendment, 'created')

    const tenant = req.tenantContext
    await writeAuditLog(req, {
      action_type: 'order.amendment_created',
      tenant_type: tenant?.tenantType,
      tenant_id: tenant?.tenantId,
      target_id: orderId,
      payload_json: {
        resource_type: 'order_amendment',
        resource_id: amendment.id,
        change_type: body.changeType,
      },
    })

    res.status(201).json({ ok: true, data: { amendment }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:amendmentId/accept', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const { orderId, amendmentId } = req.params
    const order = await assertOrderAccess(req, orderId)
    const { responseNotes } = req.body || {}
    const { amendment, newTotal } = await acceptAmendment(
      amendmentId,
      orderId,
      req.userData.id,
      responseNotes
    )

    await notifyAmendmentParty(order, amendment, 'accepted')

    const tenant = req.tenantContext
    await writeAuditLog(req, {
      action_type: 'order.amendment_accepted',
      tenant_type: tenant?.tenantType,
      tenant_id: tenant?.tenantId,
      target_id: orderId,
      payload_json: {
        resource_type: 'order_amendment',
        resource_id: amendmentId,
        new_total: newTotal,
      },
    })

    res.json({
      ok: true,
      data: { amendment, orderTotal: newTotal },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/:amendmentId/reject', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const { orderId, amendmentId } = req.params
    const order = await assertOrderAccess(req, orderId)
    const notes = req.body?.responseNotes || req.body?.notes
    if (!notes) throw new ValidationError('responseNotes are required')

    const { rows } = await query(
      `
      UPDATE order_amendments
      SET status = 'rejected', responded_by = $1, response_notes = $2, responded_at = NOW(), updated_at = NOW()
      WHERE id = $3 AND order_id = $4 AND status = 'pending'
      RETURNING *
      `,
      [req.userData.id, notes, amendmentId, orderId]
    )
    if (!rows.length) throw new NotFoundError('Pending amendment not found')
    if (rows[0].requested_by === req.userData.id) {
      throw new ValidationError('You cannot reject your own amendment request')
    }

    await notifyAmendmentParty(order, rows[0], 'rejected')
    res.json({ ok: true, data: { amendment: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:amendmentId/cancel', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const { orderId, amendmentId } = req.params
    await assertOrderAccess(req, orderId)

    const { rows } = await query(
      `
      UPDATE order_amendments
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND order_id = $2 AND status = 'pending' AND requested_by = $3
      RETURNING *
      `,
      [amendmentId, orderId, req.userData.id]
    )
    if (!rows.length) {
      throw new NotFoundError('Pending amendment not found or not owned by requester')
    }
    res.json({ ok: true, data: { amendment: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

export { router as orderAmendmentsRouter }
