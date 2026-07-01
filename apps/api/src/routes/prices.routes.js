import express from 'express'
import {
  requireAuth,
  requireRole,
  getSupplierIdForRequest,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { z } from 'zod'
import { buildWhitelistedUpdate } from '../lib/safe-update.js'
import { resolveRequestLocale, localizedError } from '../i18n/index.js'

const router = express.Router()

function priceErr(req, name, key, vars = {}) {
  return localizedError(resolveRequestLocale(req), name, `errors.${key}`, vars, 'prices')
}

// Validation schemas
const priceCreateSchema = z.object({
  productId: z.string().uuid(),
  currency: z.string().min(3).max(3),
  amount: z.number().positive(),
  minQty: z.number().positive().default(1),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
})

const priceUpdateSchema = z.object({
  currency: z.string().min(3).max(3).optional(),
  amount: z.number().positive().optional(),
  minQty: z.number().positive().optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
})

// Get prices for a product
router.get('/product/:productId', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params

    const { rows: products } = await query(
      `
      SELECT p.id, p.supplier_id, s.contact_email
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      WHERE p.id = $1
    `,
      [productId]
    )

    if (products.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: priceErr(req, 'NOT_FOUND', 'productNotFound'),
        requestId: req.requestId,
      })
    }

    const product = products[0]

    if (req.userData.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId || product.supplier_id !== supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: priceErr(req, 'FORBIDDEN', 'accessDeniedOwnProducts'),
          requestId: req.requestId,
        })
      }
    } else if (req.userData.role === 'RESTAURANT') {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: priceErr(req, 'FORBIDDEN', 'accessDenied'),
          requestId: req.requestId,
        })
      }
      const { rows: connected } = await query(
        `
        SELECT 1
        FROM supplier_follow sf
        WHERE sf.supplier_id = $1
          AND sf.restaurant_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM supplier_blocklist sb
            WHERE sb.supplier_id = $1 AND sb.restaurant_id = $2
          )
        LIMIT 1
      `,
        [product.supplier_id, restaurantId]
      )
      if (!connected.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: priceErr(req, 'NOT_FOUND', 'productNotFound'),
          requestId: req.requestId,
        })
      }
    } else if (req.userData.role !== 'ADMIN') {
      return res.status(403).json({
        ok: false,
        data: null,
        error: priceErr(req, 'FORBIDDEN', 'accessDenied'),
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
      SELECT p.*, pr.name as product_name, pr.sku
      FROM price p
      JOIN product pr ON pr.id = p.product_id
      WHERE p.product_id = $1
      ORDER BY p.valid_from DESC
    `,
      [productId]
    )

    res.json({
      ok: true,
      data: { prices: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get prices error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: priceErr(req, 'INTERNAL_ERROR', 'failedGetPrices'),
      requestId: req.requestId,
    })
  }
})

// Create price (supplier or admin only)
router.post('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const priceData = priceCreateSchema.parse(req.body)

    // Verify product ownership for suppliers
    if (req.userData.role === 'SUPPLIER') {
      const { rows: products } = await query(
        `
        SELECT p.*, s.contact_email 
        FROM product p 
        JOIN supplier s ON s.id = p.supplier_id 
        WHERE p.id = $1
      `,
        [priceData.productId]
      )

      if (products.length === 0) {
        throw new ValidationError('Product not found')
      }

      if (products[0].contact_email !== req.userData.email) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: priceErr(req, 'FORBIDDEN', 'accessDeniedSetOwnProducts'),
          requestId: req.requestId,
        })
      }
    }

    const { rows } = await query(
      `
      INSERT INTO price (product_id, currency, amount, min_qty, valid_from, valid_to)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        priceData.productId,
        priceData.currency,
        priceData.amount,
        priceData.minQty,
        priceData.validFrom || new Date(),
        priceData.validTo,
      ]
    )

    logger.info('Price created', {
      priceId: rows[0].id,
      productId: priceData.productId,
      actor: req.userData.id,
    })

    const { hookRecipeCostingAfterCatalogPriceChange } = await import(
      '../services/recipe-purchasing-hooks.service.js'
    )
    hookRecipeCostingAfterCatalogPriceChange(
      priceData.productId,
      Number(priceData.amount),
      'CATALOG'
    )

    res.status(201).json({
      ok: true,
      data: { price: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { ...priceErr(req, 'VALIDATION_ERROR', 'invalidPriceData'), details: error.errors },
        requestId: req.requestId,
      })
    }

    logger.error('Create price error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: priceErr(req, 'INTERNAL_ERROR', 'failedCreatePrice'),
      requestId: req.requestId,
    })
  }
})

// Update price
router.patch('/:id', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params
    const updateData = priceUpdateSchema.parse(req.body)

    // Check ownership for suppliers
    if (req.userData.role === 'SUPPLIER') {
      const { rows: prices } = await query(
        `
        SELECT p.*, s.contact_email 
        FROM price p 
        JOIN product pr ON pr.id = p.product_id
        JOIN supplier s ON s.id = pr.supplier_id 
        WHERE p.id = $1
      `,
        [id]
      )

      if (prices.length === 0) {
        throw new ValidationError('Price not found')
      }

      if (prices[0].contact_email !== req.userData.email) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: priceErr(req, 'FORBIDDEN', 'accessDeniedUpdateOwnProducts'),
          requestId: req.requestId,
        })
      }
    }

    const {
      fields: updateFields,
      values: updateValues,
      nextIndex: paramIndex,
    } = buildWhitelistedUpdate(updateData, {
      currency: 'currency',
      amount: 'amount',
      minQty: 'min_qty',
      validFrom: 'valid_from',
      validTo: 'valid_to',
    })

    if (updateFields.length === 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: priceErr(req, 'VALIDATION_ERROR', 'noFieldsToUpdate'),
        requestId: req.requestId,
      })
    }

    updateValues.push(id)

    const { rows } = await query(
      `
      UPDATE price 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `,
      updateValues
    )

    logger.info('Price updated', {
      priceId: rows[0].id,
      actor: req.userData.id,
    })

    res.json({
      ok: true,
      data: { price: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { ...priceErr(req, 'VALIDATION_ERROR', 'invalidUpdateData'), details: error.errors },
        requestId: req.requestId,
      })
    }

    logger.error('Update price error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: priceErr(req, 'INTERNAL_ERROR', 'failedUpdatePrice'),
      requestId: req.requestId,
    })
  }
})

export { router as pricesRoutes }
