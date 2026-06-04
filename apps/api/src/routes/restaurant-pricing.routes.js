import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  resolveAdminContext,
  requirePermission,
  requireAnyPermission,
  getSupplierIdForRequest,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { resolveProductPricesBatch } from '../services/resolve-product-price.service.js'
import { z } from 'zod'

const router = express.Router()

router.use(requireAuth, resolveTenantContext, resolveAdminContext)

const supplierRead = requireAnyPermission('CATALOG_VIEW', 'INVOICES_VIEW', 'ORDERS_VIEW')
const supplierWrite = requireAnyPermission('CATALOG_MANAGE', 'CATALOG_EDIT')
const restaurantRead = requirePermission('CATALOG_VIEW')

const createPricingSchema = z.object({
  restaurantId: z.string().uuid(),
  productId: z.string().uuid(),
  price: z.number().positive(),
  currency: z.string().default('USD'),
  contractDiscountPercentage: z.number().min(0).max(100).optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  agreementType: z.enum(['VOLUME', 'RELATIONSHIP', 'CUSTOM', 'SPECIAL']).default('CUSTOM'),
  minOrderQuantity: z.number().nonnegative().optional(),
  notes: z.string().optional(),
})

const updatePricingSchema = z.object({
  price: z.number().positive().optional(),
  contractDiscountPercentage: z.number().min(0).max(100).optional().nullable(),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
  agreementType: z.enum(['VOLUME', 'RELATIONSHIP', 'CUSTOM', 'SPECIAL']).optional(),
  minOrderQuantity: z.number().nonnegative().optional().nullable(),
  isActive: z.boolean().optional(),
  notes: z.string().optional().nullable(),
})

const resolveSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        supplierId: z.string().uuid(),
        quantity: z.number().positive().default(1),
      })
    )
    .min(1)
    .max(200),
})

const bulkCreateSchema = z.object({
  restaurantId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        price: z.number().positive(),
        currency: z.string().optional(),
        contractDiscountPercentage: z.number().min(0).max(100).optional(),
        contractStartDate: z.string().optional(),
        contractEndDate: z.string().optional(),
        agreementType: z.enum(['VOLUME', 'RELATIONSHIP', 'CUSTOM', 'SPECIAL']).optional(),
        minOrderQuantity: z.number().nonnegative().optional(),
        notes: z.string().optional(),
      })
    )
    .min(1)
    .max(500),
})

function mapPricingRow(row) {
  return {
    ...row,
    price: row.price != null ? Number(row.price) : null,
    contract_discount_percentage:
      row.contract_discount_percentage != null ? Number(row.contract_discount_percentage) : null,
    min_order_quantity: row.min_order_quantity != null ? Number(row.min_order_quantity) : null,
  }
}

// Restaurant: resolve prices for cart preview (must be before /:id)
router.post('/resolve', requireRole(['RESTAURANT', 'ADMIN']), restaurantRead, async (req, res) => {
  try {
    const { items } = resolveSchema.parse(req.body)
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Restaurant workspace not found' },
        requestId: req.requestId,
      })
    }

    const resolved = await resolveProductPricesBatch({ restaurantId, items })
    res.json({
      ok: true,
      data: { items: resolved },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid resolve payload',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    logger.error({ message: 'Resolve contract prices error', error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to resolve prices' },
      requestId: req.requestId,
    })
  }
})

// Restaurant: view own contract prices
router.get(
  '/my-pricing',
  requireRole(['RESTAURANT', 'ADMIN']),
  restaurantRead,
  async (req, res) => {
    try {
      const { supplierId, productId, q } = req.query
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Restaurant workspace not found' },
          requestId: req.requestId,
        })
      }

      const conditions = [
        'rp.restaurant_id = $1',
        'rp.is_active = true',
        '(rp.contract_end_date IS NULL OR rp.contract_end_date >= CURRENT_DATE)',
        '(rp.contract_start_date IS NULL OR rp.contract_start_date <= CURRENT_DATE)',
      ]
      const params = [restaurantId]
      let idx = 2

      if (supplierId) {
        conditions.push(`rp.supplier_id = $${idx++}`)
        params.push(supplierId)
      }
      if (productId) {
        conditions.push(`rp.product_id = $${idx++}`)
        params.push(productId)
      }
      if (q) {
        conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx} OR s.name ILIKE $${idx})`)
        params.push(`%${q}%`)
        idx++
      }

      const { rows } = await query(
        `
        SELECT
          rp.*,
          p.name as product_name,
          p.sku as product_sku,
          p.supplier_id,
          s.name as supplier_name,
          pr.amount as catalog_price
        FROM restaurant_pricing rp
        JOIN product p ON p.id = rp.product_id
        JOIN supplier s ON s.id = rp.supplier_id
        LEFT JOIN LATERAL (
          SELECT amount FROM price
          WHERE product_id = p.id
            AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
          ORDER BY valid_from DESC
          LIMIT 1
        ) pr ON true
        WHERE ${conditions.join(' AND ')}
        ORDER BY s.name, p.name
        LIMIT 500
        `,
        params,
        req
      )

      const pricing = rows.map(mapPricingRow)
      const bySupplier = {}
      for (const row of pricing) {
        if (!bySupplier[row.supplier_name]) {
          bySupplier[row.supplier_name] = {
            supplier_id: row.supplier_id,
            supplier_name: row.supplier_name,
            product_count: 0,
            products: [],
          }
        }
        bySupplier[row.supplier_name].product_count++
        bySupplier[row.supplier_name].products.push(row)
      }

      res.json({
        ok: true,
        data: { pricing, summary: Object.values(bySupplier) },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({ message: 'Get my pricing error', error: error.message })
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to get restaurant pricing' },
        requestId: req.requestId,
      })
    }
  }
)

// Supplier: list contract prices with filters
router.get('/', requireRole(['SUPPLIER', 'ADMIN']), supplierRead, async (req, res) => {
  try {
    const supplierId = await getSupplierIdForRequest(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier workspace not found' },
        requestId: req.requestId,
      })
    }

    const { restaurantId, productId, q, status = 'all' } = req.query
    const conditions = ['rp.supplier_id = $1']
    const params = [supplierId]
    let idx = 2

    if (restaurantId) {
      conditions.push(`rp.restaurant_id = $${idx++}`)
      params.push(restaurantId)
    }
    if (productId) {
      conditions.push(`rp.product_id = $${idx++}`)
      params.push(productId)
    }
    if (q) {
      conditions.push(`(r.name ILIKE $${idx} OR p.name ILIKE $${idx} OR p.sku ILIKE $${idx})`)
      params.push(`%${q}%`)
      idx++
    }
    if (status === 'active') {
      conditions.push('rp.is_active = true')
      conditions.push('(rp.contract_end_date IS NULL OR rp.contract_end_date >= CURRENT_DATE)')
      conditions.push('(rp.contract_start_date IS NULL OR rp.contract_start_date <= CURRENT_DATE)')
    } else if (status === 'inactive') {
      conditions.push('rp.is_active = false')
    } else if (status === 'expired') {
      conditions.push('rp.contract_end_date IS NOT NULL AND rp.contract_end_date < CURRENT_DATE')
    }

    const { rows } = await query(
      `
      SELECT
        rp.*,
        r.name as restaurant_name,
        r.contact_email as restaurant_email,
        p.name as product_name,
        p.sku as product_sku,
        pr.amount as catalog_price
      FROM restaurant_pricing rp
      JOIN restaurant r ON r.id = rp.restaurant_id
      JOIN product p ON p.id = rp.product_id
      LEFT JOIN LATERAL (
        SELECT amount FROM price
        WHERE product_id = p.id
          AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
        ORDER BY valid_from DESC
        LIMIT 1
      ) pr ON true
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.name, p.name
      `,
      params
    )

    res.json({
      ok: true,
      data: { pricing: rows.map(mapPricingRow) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({ message: 'Get restaurant pricing error', error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get restaurant pricing' },
      requestId: req.requestId,
    })
  }
})

// Supplier: create or upsert contract price
router.post('/', requireRole(['SUPPLIER', 'ADMIN']), supplierWrite, async (req, res) => {
  try {
    const pricingData = createPricingSchema.parse(req.body)
    const supplierId = await getSupplierIdForRequest(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier workspace not found' },
        requestId: req.requestId,
      })
    }

    const { rows: products } = await query(
      'SELECT id FROM product WHERE id = $1 AND supplier_id = $2',
      [pricingData.productId, supplierId]
    )
    if (products.length === 0) {
      throw new NotFoundError('Product not found or does not belong to supplier')
    }

    const { rows: restaurants } = await query('SELECT id FROM restaurant WHERE id = $1', [
      pricingData.restaurantId,
    ])
    if (restaurants.length === 0) {
      throw new NotFoundError('Restaurant not found')
    }

    const {
      rows: [pricing],
    } = await query(
      `
      INSERT INTO restaurant_pricing (
        supplier_id, restaurant_id, product_id, price, currency,
        contract_discount_percentage, contract_start_date, contract_end_date,
        agreement_type, min_order_quantity, notes, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
      ON CONFLICT (supplier_id, restaurant_id, product_id)
      DO UPDATE SET
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        contract_discount_percentage = EXCLUDED.contract_discount_percentage,
        contract_start_date = EXCLUDED.contract_start_date,
        contract_end_date = EXCLUDED.contract_end_date,
        agreement_type = EXCLUDED.agreement_type,
        min_order_quantity = EXCLUDED.min_order_quantity,
        notes = EXCLUDED.notes,
        is_active = true,
        updated_at = now()
      RETURNING *
      `,
      [
        supplierId,
        pricingData.restaurantId,
        pricingData.productId,
        pricingData.price,
        pricingData.currency,
        pricingData.contractDiscountPercentage ?? null,
        pricingData.contractStartDate || null,
        pricingData.contractEndDate || null,
        pricingData.agreementType,
        pricingData.minOrderQuantity ?? null,
        pricingData.notes || null,
      ]
    )

    logger.info('Restaurant pricing upserted', {
      supplierId,
      restaurantId: pricingData.restaurantId,
      productId: pricingData.productId,
    })

    res.json({
      ok: true,
      data: { pricing: mapPricingRow(pricing) },
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
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid pricing data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    logger.error({ message: 'Create restaurant pricing error', error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to create restaurant pricing' },
      requestId: req.requestId,
    })
  }
})

// Supplier: bulk set prices for one restaurant
router.post('/bulk', requireRole(['SUPPLIER', 'ADMIN']), supplierWrite, async (req, res) => {
  try {
    const bulkData = bulkCreateSchema.parse(req.body)
    const supplierId = await getSupplierIdForRequest(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier workspace not found' },
        requestId: req.requestId,
      })
    }

    const { rows: restaurants } = await query('SELECT id FROM restaurant WHERE id = $1', [
      bulkData.restaurantId,
    ])
    if (restaurants.length === 0) {
      throw new NotFoundError('Restaurant not found')
    }

    const productIds = bulkData.items.map((i) => i.productId)
    const { rows: ownedProducts } = await query(
      'SELECT id FROM product WHERE id = ANY($1::uuid[]) AND supplier_id = $2',
      [productIds, supplierId]
    )
    if (ownedProducts.length !== new Set(productIds).size) {
      throw new ValidationError('One or more products do not belong to this supplier')
    }

    const created = []
    for (const item of bulkData.items) {
      const {
        rows: [pricing],
      } = await query(
        `
        INSERT INTO restaurant_pricing (
          supplier_id, restaurant_id, product_id, price, currency,
          contract_discount_percentage, contract_start_date, contract_end_date,
          agreement_type, min_order_quantity, notes, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
        ON CONFLICT (supplier_id, restaurant_id, product_id)
        DO UPDATE SET
          price = EXCLUDED.price,
          currency = EXCLUDED.currency,
          contract_discount_percentage = EXCLUDED.contract_discount_percentage,
          contract_start_date = EXCLUDED.contract_start_date,
          contract_end_date = EXCLUDED.contract_end_date,
          agreement_type = EXCLUDED.agreement_type,
          min_order_quantity = EXCLUDED.min_order_quantity,
          notes = EXCLUDED.notes,
          is_active = true,
          updated_at = now()
        RETURNING *
        `,
        [
          supplierId,
          bulkData.restaurantId,
          item.productId,
          item.price,
          item.currency || 'USD',
          item.contractDiscountPercentage ?? null,
          item.contractStartDate || null,
          item.contractEndDate || null,
          item.agreementType || 'CUSTOM',
          item.minOrderQuantity ?? null,
          item.notes || null,
        ]
      )
      created.push(mapPricingRow(pricing))
    }

    res.json({
      ok: true,
      data: { pricing: created, count: created.length },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid bulk pricing data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    logger.error({ message: 'Bulk restaurant pricing error', error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to bulk create pricing' },
      requestId: req.requestId,
    })
  }
})

router.patch('/:id', requireRole(['SUPPLIER', 'ADMIN']), supplierWrite, async (req, res) => {
  try {
    const { id } = req.params
    const updateData = updatePricingSchema.parse(req.body)
    const supplierId = await getSupplierIdForRequest(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier workspace not found' },
        requestId: req.requestId,
      })
    }

    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    const fieldMap = {
      price: 'price',
      contractDiscountPercentage: 'contract_discount_percentage',
      contractStartDate: 'contract_start_date',
      contractEndDate: 'contract_end_date',
      agreementType: 'agreement_type',
      minOrderQuantity: 'min_order_quantity',
      isActive: 'is_active',
      notes: 'notes',
    }

    for (const [key, column] of Object.entries(fieldMap)) {
      if (updateData[key] !== undefined) {
        updateFields.push(`${column} = $${paramIndex++}`)
        updateValues.push(updateData[key])
      }
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update')
    }

    updateFields.push('updated_at = now()')
    updateValues.push(id, supplierId)

    const {
      rows: [pricing],
    } = await query(
      `
      UPDATE restaurant_pricing
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND supplier_id = $${paramIndex + 1}
      RETURNING *
      `,
      updateValues
    )

    if (!pricing) {
      throw new NotFoundError('Pricing not found')
    }

    res.json({
      ok: true,
      data: { pricing: mapPricingRow(pricing) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
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
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid pricing data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    logger.error({ message: 'Update restaurant pricing error', error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update restaurant pricing' },
      requestId: req.requestId,
    })
  }
})

router.delete('/:id', requireRole(['SUPPLIER', 'ADMIN']), supplierWrite, async (req, res) => {
  try {
    const { id } = req.params
    const supplierId = await getSupplierIdForRequest(req)
    if (!supplierId) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Supplier workspace not found' },
        requestId: req.requestId,
      })
    }

    const {
      rows: [pricing],
    } = await query(
      `
      UPDATE restaurant_pricing
      SET is_active = false, updated_at = now()
      WHERE id = $1 AND supplier_id = $2
      RETURNING *
      `,
      [id, supplierId]
    )

    if (!pricing) {
      throw new NotFoundError('Pricing not found')
    }

    res.json({
      ok: true,
      data: { pricing: mapPricingRow(pricing) },
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
    logger.error({ message: 'Deactivate restaurant pricing error', error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to deactivate pricing' },
      requestId: req.requestId,
    })
  }
})

export { router as restaurantPricingRoutes }
