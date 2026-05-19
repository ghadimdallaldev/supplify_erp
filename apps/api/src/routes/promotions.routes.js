import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { loadActivePromotionsForSupplier } from '../services/promotions.service.js'
import { writeAuditLog } from '../lib/audit.js'

const router = express.Router()

const promotionBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  type: z.enum([
    'percentage_discount',
    'fixed_discount',
    'free_shipping',
    'buy_x_get_y',
    'featured_listing',
  ]),
  discountValue: z.number().nonnegative().optional().nullable(),
  minOrderAmount: z.number().nonnegative().optional().nullable(),
  maxDiscountCap: z.number().nonnegative().optional().nullable(),
  buyQuantity: z.number().int().positive().optional().nullable(),
  getQuantity: z.number().int().positive().optional().nullable(),
  appliesTo: z.enum(['all', 'specific_products', 'specific_categories']).default('all'),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
  isFeatured: z.boolean().optional(),
  productIds: z.array(z.string().uuid()).optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  restaurantIds: z.array(z.string().uuid()).optional(),
})

async function getSupplierId(req) {
  if (req.tenantContext?.tenantType === 'SUPPLIER' && req.tenantContext?.tenantId) {
    return req.tenantContext.tenantId
  }
  const { rows } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
    req.userData.email,
  ])
  if (!rows.length) throw new ValidationError('Supplier not found')
  return rows[0].id
}

async function getRestaurantId(req) {
  if (req.tenantContext?.tenantType === 'RESTAURANT' && req.tenantContext?.tenantId) {
    return req.tenantContext.tenantId
  }
  const { rows } = await query('SELECT id FROM restaurant WHERE contact_email = $1', [
    req.userData.email,
  ])
  if (!rows.length) throw new ValidationError('Restaurant not found')
  return rows[0].id
}

async function loadPromotionForSupplier(promotionId, supplierId) {
  const { rows } = await query(`SELECT * FROM promotions WHERE id = $1 AND supplier_id = $2`, [
    promotionId,
    supplierId,
  ])
  if (!rows.length) throw new NotFoundError('Promotion not found')
  return rows[0]
}

async function syncPromotionTargets(client, promotionId, productIds = [], categoryIds = []) {
  await client.query(`DELETE FROM promotion_targets WHERE promotion_id = $1`, [promotionId])
  for (const productId of productIds) {
    await client.query(`INSERT INTO promotion_targets (promotion_id, product_id) VALUES ($1, $2)`, [
      promotionId,
      productId,
    ])
  }
  for (const categoryId of categoryIds) {
    await client.query(
      `INSERT INTO promotion_targets (promotion_id, category_id) VALUES ($1, $2)`,
      [promotionId, categoryId]
    )
  }
}

async function syncRestaurantTargets(client, promotionId, restaurantIds = []) {
  await client.query(`DELETE FROM promotion_restaurant_targets WHERE promotion_id = $1`, [
    promotionId,
  ])
  for (const restaurantId of restaurantIds) {
    await client.query(
      `INSERT INTO promotion_restaurant_targets (promotion_id, restaurant_id) VALUES ($1, $2)`,
      [promotionId, restaurantId]
    )
  }
}

// Restaurant: active promotions visible to this tenant
router.get(
  '/active',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const { supplierId } = req.query
      let sql = `
        SELECT p.*, s.name AS supplier_name, s.slug AS supplier_slug
        FROM promotions p
        JOIN supplier s ON s.id = p.supplier_id
        WHERE p.status = 'active'
          AND p.starts_at <= NOW()
          AND (p.ends_at IS NULL OR p.ends_at > NOW())
          AND (p.usage_limit IS NULL OR p.usage_count < p.usage_limit)
          AND (
            NOT EXISTS (SELECT 1 FROM promotion_restaurant_targets prt WHERE prt.promotion_id = p.id)
            OR EXISTS (
              SELECT 1 FROM promotion_restaurant_targets prt
              WHERE prt.promotion_id = p.id AND prt.restaurant_id = $1
            )
          )
      `
      const params = [restaurantId]
      if (supplierId) {
        params.push(supplierId)
        sql += ` AND p.supplier_id = $${params.length}`
      }
      sql += ' ORDER BY p.is_featured DESC, p.starts_at DESC'
      const { rows } = await query(sql, params)
      res.json({ ok: true, data: { promotions: rows }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

// Supplier CRUD
router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  requirePermission('CATALOG_MANAGE')
)

router.get('/', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const { status } = req.query
    const params = [supplierId]
    let sql = `SELECT * FROM promotions WHERE supplier_id = $1`
    if (status) {
      params.push(status)
      sql += ` AND status = $${params.length}`
    }
    sql += ' ORDER BY created_at DESC'
    const { rows } = await query(sql, params)
    res.json({ ok: true, data: { promotions: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const body = promotionBodySchema.parse(req.body)
    const promotion = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `
        INSERT INTO promotions (
          supplier_id, name, description, type, discount_value, min_order_amount,
          max_discount_cap, buy_quantity, get_quantity, applies_to, starts_at, ends_at,
          usage_limit, is_featured, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft')
        RETURNING *
        `,
        [
          supplierId,
          body.name,
          body.description ?? null,
          body.type,
          body.discountValue ?? null,
          body.minOrderAmount ?? null,
          body.maxDiscountCap ?? null,
          body.buyQuantity ?? null,
          body.getQuantity ?? null,
          body.appliesTo,
          body.startsAt,
          body.endsAt ?? null,
          body.usageLimit ?? null,
          body.isFeatured ?? false,
        ]
      )
      const created = rows[0]
      if (body.appliesTo !== 'all') {
        await syncPromotionTargets(
          client,
          created.id,
          body.productIds || [],
          body.categoryIds || []
        )
      }
      if (body.restaurantIds?.length) {
        await syncRestaurantTargets(client, created.id, body.restaurantIds)
      }
      return created
    })
    await writeAuditLog(req, {
      action_type: 'promotion.created',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: promotion.id,
      payload_json: { resource_type: 'promotion', name: promotion.name },
    })
    res.status(201).json({ ok: true, data: { promotion }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const existing = await loadPromotionForSupplier(req.params.id, supplierId)
    const body = promotionBodySchema.partial().parse(req.body)

    if (existing.status === 'active' && body.discountValue !== undefined) {
      throw new ValidationError('Cannot change discount value on an active promotion')
    }

    const promotion = await withTransaction(async (client) => {
      const fields = []
      const values = []
      let i = 1
      const map = {
        name: 'name',
        description: 'description',
        type: 'type',
        discountValue: 'discount_value',
        minOrderAmount: 'min_order_amount',
        maxDiscountCap: 'max_discount_cap',
        buyQuantity: 'buy_quantity',
        getQuantity: 'get_quantity',
        appliesTo: 'applies_to',
        startsAt: 'starts_at',
        endsAt: 'ends_at',
        usageLimit: 'usage_limit',
        isFeatured: 'is_featured',
      }
      for (const [key, col] of Object.entries(map)) {
        if (body[key] !== undefined) {
          fields.push(`${col} = $${i++}`)
          values.push(body[key])
        }
      }
      if (!fields.length && !body.productIds && !body.categoryIds && !body.restaurantIds) {
        return existing
      }
      let updated = existing
      if (fields.length) {
        fields.push('updated_at = NOW()')
        values.push(existing.id)
        const { rows } = await client.query(
          `UPDATE promotions SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
          values
        )
        updated = rows[0]
      }
      if (body.productIds || body.categoryIds) {
        await syncPromotionTargets(
          client,
          updated.id,
          body.productIds || [],
          body.categoryIds || []
        )
      }
      if (body.restaurantIds) {
        await syncRestaurantTargets(client, updated.id, body.restaurantIds)
      }
      return updated
    })

    await writeAuditLog(req, {
      action_type: 'promotion.updated',
      tenant_type: 'SUPPLIER',
      tenant_id: supplierId,
      target_id: promotion.id,
      payload_json: { resource_type: 'promotion' },
    })
    res.json({ ok: true, data: { promotion }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/activate', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    await loadPromotionForSupplier(req.params.id, supplierId)
    const { rows } = await query(
      `UPDATE promotions SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/pause', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    await loadPromotionForSupplier(req.params.id, supplierId)
    const { rows } = await query(
      `UPDATE promotions SET status = 'paused', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    res.json({ ok: true, data: { promotion: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    const existing = await loadPromotionForSupplier(req.params.id, supplierId)
    if (existing.status !== 'draft') {
      throw new ValidationError('Only draft promotions can be deleted')
    }
    await query(`DELETE FROM promotions WHERE id = $1`, [req.params.id])
    res.json({ ok: true, data: { deleted: true }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/:id/analytics', async (req, res, next) => {
  try {
    const supplierId = await getSupplierId(req)
    await loadPromotionForSupplier(req.params.id, supplierId)
    const { rows: usage } = await query(
      `
      SELECT
        COUNT(*)::int AS usage_count,
        COALESCE(SUM(pu.discount_applied), 0)::numeric AS total_discount,
        COUNT(DISTINCT pu.order_id)::int AS orders_influenced
      FROM promotion_usages pu
      WHERE pu.promotion_id = $1
      `,
      [req.params.id]
    )
    const { rows: topRestaurants } = await query(
      `
      SELECT r.id, r.name, COUNT(*)::int AS usage_count, SUM(pu.discount_applied)::numeric AS discount_total
      FROM promotion_usages pu
      JOIN restaurant r ON r.id = pu.restaurant_id
      WHERE pu.promotion_id = $1
      GROUP BY r.id, r.name
      ORDER BY usage_count DESC
      LIMIT 10
      `,
      [req.params.id]
    )
    res.json({
      ok: true,
      data: {
        analytics: {
          ...usage[0],
          topRestaurants,
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (err) {
    next(err)
  }
})

export { router as promotionsRoutes, loadActivePromotionsForSupplier }
