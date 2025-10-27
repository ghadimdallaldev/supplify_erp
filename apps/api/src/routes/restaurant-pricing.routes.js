import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query, withTransaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const createPricingSchema = z.object({
  restaurantId: z.string().uuid(),
  productId: z.string().uuid(),
  price: z.number().positive(),
  currency: z.string().default('USD'),
  pricingTierId: z.string().uuid().optional(),
  contractDiscountPercentage: z.number().min(0).max(100).optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  pricingType: z.enum(['CONTRACT', 'VOLUME', 'RELATIONSHIP', 'CUSTOM']).default('CONTRACT'),
  notes: z.string().optional(),
});

const updatePricingSchema = z.object({
  price: z.number().positive().optional(),
  pricingTierId: z.string().uuid().optional(),
  contractDiscountPercentage: z.number().min(0).max(100).optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  pricingType: z.enum(['CONTRACT', 'VOLUME', 'RELATIONSHIP', 'CUSTOM']).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});

const createPricingTierSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  minOrderValue: z.number().nonnegative().optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
});

// SUPPLIER ENDPOINTS - Manage restaurant-specific pricing

// Get all restaurant-specific pricing for a supplier
router.get('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const { supplierId } = await getSupplierFromEmail(req.userData.email);
    
    const { rows } = await query(`
      SELECT 
        rp.*,
        r.name as restaurant_name,
        r.contact_email as restaurant_email,
        p.name as product_name,
        p.sku as product_sku,
        pt.name as tier_name
      FROM restaurant_pricing rp
      JOIN restaurant r ON r.id = rp.restaurant_id
      JOIN product p ON p.id = rp.product_id
      LEFT JOIN pricing_tier pt ON pt.id = rp.pricing_tier_id
      WHERE rp.supplier_id = $1
      ORDER BY r.name, p.name
    `, [supplierId]);

    res.json({
      ok: true,
      data: { pricing: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({
      message: 'Get restaurant pricing error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get restaurant pricing',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Create restaurant-specific pricing (supplier action)
router.post('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const pricingData = createPricingSchema.parse(req.body);
    const { supplierId } = await getSupplierFromEmail(req.userData.email);

    // Verify product belongs to supplier
    const { rows: products } = await query(
      'SELECT id FROM product WHERE id = $1 AND supplier_id = $2',
      [pricingData.productId, supplierId]
    );

    if (products.length === 0) {
      throw new NotFoundError('Product not found or does not belong to supplier');
    }

    // Verify restaurant exists
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE id = $1',
      [pricingData.restaurantId]
    );

    if (restaurants.length === 0) {
      throw new NotFoundError('Restaurant not found');
    }

    // Check if pricing tier exists (if provided)
    if (pricingData.pricingTierId) {
      const { rows: tiers } = await query(
        'SELECT id FROM pricing_tier WHERE id = $1 AND supplier_id = $2',
        [pricingData.pricingTierId, supplierId]
      );

      if (tiers.length === 0) {
        throw new NotFoundError('Pricing tier not found or does not belong to supplier');
      }
    }

    // Create or update pricing
    const { rows: [pricing] } = await query(`
      INSERT INTO restaurant_pricing (
        supplier_id, restaurant_id, product_id, price, currency,
        pricing_tier_id, contract_discount_percentage, 
        contract_start_date, contract_end_date, pricing_type, notes, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
      ON CONFLICT (supplier_id, restaurant_id, product_id)
      DO UPDATE SET
        price = EXCLUDED.price,
        pricing_tier_id = EXCLUDED.pricing_tier_id,
        contract_discount_percentage = EXCLUDED.contract_discount_percentage,
        contract_start_date = EXCLUDED.contract_start_date,
        contract_end_date = EXCLUDED.contract_end_date,
        pricing_type = EXCLUDED.pricing_type,
        notes = EXCLUDED.notes,
        is_active = true,
        updated_at = now()
      RETURNING *
    `, [
      supplierId,
      pricingData.restaurantId,
      pricingData.productId,
      pricingData.price,
      pricingData.currency,
      pricingData.pricingTierId || null,
      pricingData.contractDiscountPercentage || null,
      pricingData.contractStartDate || null,
      pricingData.contractEndDate || null,
      pricingData.pricingType,
      pricingData.notes || null,
    ]);

    logger.info('Restaurant pricing created', {
      supplierId,
      restaurantId: pricingData.restaurantId,
      productId: pricingData.productId,
      price: pricingData.price,
    });

    res.json({
      ok: true,
      data: { pricing },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      });
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
      });
    }

    logger.error({
      message: 'Create restaurant pricing error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create restaurant pricing',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Update restaurant-specific pricing
router.patch('/:id', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = updatePricingSchema.parse(req.body);
    const { supplierId } = await getSupplierFromEmail(req.userData.email);

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (updateData.price !== undefined) {
      updateFields.push(`price = $${paramIndex++}`);
      updateValues.push(updateData.price);
    }
    if (updateData.pricingTierId !== undefined) {
      updateFields.push(`pricing_tier_id = $${paramIndex++}`);
      updateValues.push(updateData.pricingTierId);
    }
    if (updateData.contractDiscountPercentage !== undefined) {
      updateFields.push(`contract_discount_percentage = $${paramIndex++}`);
      updateValues.push(updateData.contractDiscountPercentage);
    }
    if (updateData.contractStartDate !== undefined) {
      updateFields.push(`contract_start_date = $${paramIndex++}`);
      updateValues.push(updateData.contractStartDate);
    }
    if (updateData.contractEndDate !== undefined) {
      updateFields.push(`contract_end_date = $${paramIndex++}`);
      updateValues.push(updateData.contractEndDate);
    }
    if (updateData.pricingType !== undefined) {
      updateFields.push(`pricing_type = $${paramIndex++}`);
      updateValues.push(updateData.pricingType);
    }
    if (updateData.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(updateData.isActive);
    }
    if (updateData.notes !== undefined) {
      updateFields.push(`notes = $${paramIndex++}`);
      updateValues.push(updateData.notes);
    }

    if (updateFields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updateFields.push(`updated_at = now()`);
    updateValues.push(id, supplierId);

    const { rows: [pricing] } = await query(`
      UPDATE restaurant_pricing
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND supplier_id = $${paramIndex + 1}
      RETURNING *
    `, updateValues);

    if (!pricing) {
      throw new NotFoundError('Pricing not found');
    }

    res.json({
      ok: true,
      data: { pricing },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      });
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
      });
    }

    logger.error({
      message: 'Update restaurant pricing error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update restaurant pricing',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get pricing tiers for a supplier
router.get('/tiers', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const { supplierId } = await getSupplierFromEmail(req.userData.email);

    const { rows } = await query(`
      SELECT * FROM pricing_tier
      WHERE supplier_id = $1
      ORDER BY min_order_value ASC NULLS LAST, name ASC
    `, [supplierId]);

    res.json({
      ok: true,
      data: { tiers: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({
      message: 'Get pricing tiers error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get pricing tiers',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Create pricing tier
router.post('/tiers', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const tierData = createPricingTierSchema.parse(req.body);
    const { supplierId } = await getSupplierFromEmail(req.userData.email);

    // Check if tier name already exists for supplier
    const { rows: existing } = await query(
      'SELECT id FROM pricing_tier WHERE supplier_id = $1 AND name = $2',
      [supplierId, tierData.name]
    );

    if (existing.length > 0) {
      throw new ValidationError('Pricing tier name already exists');
    }

    const { rows: [tier] } = await query(`
      INSERT INTO pricing_tier (
        supplier_id, name, description, min_order_value, discount_percentage
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      supplierId,
      tierData.name,
      tierData.description || null,
      tierData.minOrderValue || null,
      tierData.discountPercentage || null,
    ]);

    res.json({
      ok: true,
      data: { tier },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid tier data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }

    logger.error({
      message: 'Create pricing tier error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create pricing tier',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// RESTAURANT ENDPOINT - Get their pricing from suppliers
router.get('/my-pricing', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { supplierId } = req.query; // Optional filter
    const { restaurantId } = await getRestaurantFromEmail(req.userData.email);

    let queryStr = `
      SELECT 
        rp.*,
        p.name as product_name,
        p.sku as product_sku,
        p.supplier_id,
        s.name as supplier_name,
        pt.name as tier_name,
        -- Calculate effective price (after discount)
        CASE 
          WHEN rp.contract_discount_percentage > 0 
          THEN rp.price * (1 - rp.contract_discount_percentage / 100)
          ELSE rp.price
        END as effective_price
      FROM restaurant_pricing rp
      JOIN product p ON p.id = rp.product_id
      JOIN supplier s ON s.id = rp.supplier_id
      LEFT JOIN pricing_tier pt ON pt.id = rp.pricing_tier_id
      WHERE rp.restaurant_id = $1
        AND rp.is_active = true
        AND (rp.contract_end_date IS NULL OR rp.contract_end_date >= CURRENT_DATE)
        AND (rp.contract_start_date IS NULL OR rp.contract_start_date <= CURRENT_DATE)
    `;

    const params = [restaurantId];

    if (supplierId) {
      queryStr += ` AND rp.supplier_id = $${params.length + 1}`;
      params.push(supplierId);
    }

    queryStr += ` ORDER BY s.name, p.name`;

    const { rows } = await query(queryStr, params);

    // Group by supplier and calculate summary
    const bySupplier = {};
    rows.forEach(row => {
      if (!bySupplier[row.supplier_name]) {
        bySupplier[row.supplier_name] = {
          supplier_id: row.supplier_id,
          supplier_name: row.supplier_name,
          product_count: 0,
          total_contract_value: 0,
          products: [],
        };
      }
      bySupplier[row.supplier_name].product_count++;
      bySupplier[row.supplier_name].total_contract_value += parseFloat(row.effective_price || 0);
      bySupplier[row.supplier_name].products.push(row);
    });

    res.json({
      ok: true,
      data: {
        pricing: rows,
        summary: Object.values(bySupplier),
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({
      message: 'Get my pricing error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get restaurant pricing',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Helper functions
async function getSupplierFromEmail(email) {
  const { rows } = await query('SELECT id FROM supplier WHERE contact_email = $1', [email]);
  if (rows.length === 0) {
    throw new NotFoundError('Supplier not found');
  }
  return { supplierId: rows[0].id };
}

async function getRestaurantFromEmail(email) {
  const { rows } = await query('SELECT id FROM restaurant WHERE contact_email = $1', [email]);
  if (rows.length === 0) {
    throw new NotFoundError('Restaurant not found');
  }
  return { restaurantId: rows[0].id };
}

export { router as restaurantPricingRoutes };

