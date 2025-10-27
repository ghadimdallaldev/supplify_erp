import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query, withTransaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const adjustInventorySchema = z.object({
  adjustmentType: z.enum(['WASTAGE', 'SPOILAGE', 'COUNT_CORRECTION', 'OTHER']),
  quantity: z.number().positive(),
  reason: z.string().optional(),
});

const updateInventorySchema = z.object({
  quantity: z.number().min(0).optional(),
  lowStockThreshold: z.number().positive().optional(),
});

// Get restaurant inventory with products
router.get('/', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    const { rows } = await query(`
      SELECT 
        ri.*,
        p.name as product_name,
        p.sku as product_sku,
        p.unit as product_unit,
        p.supplier_id,
        s.name as supplier_name,
        COALESCE(ri.low_stock_threshold, 0) as low_stock_threshold,
        b.name as branch_name
      FROM restaurant_inventory ri
      JOIN product p ON p.id = ri.product_id
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN branch b ON b.id = ri.branch_id
      WHERE ri.restaurant_id = $1
      ORDER BY p.name
    `, [restaurantId]);

    res.json({
      ok: true,
      data: { inventory: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Get restaurant inventory error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get inventory',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get all inventory movement history
router.get('/history', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;
    const { limit = '100' } = req.query;

    const { rows } = await query(`
      SELECT 
        iml.*,
        p.name as product_name,
        p.sku as product_sku
      FROM inventory_movement_log iml
      JOIN product p ON p.id = iml.product_id
      WHERE iml.restaurant_id = $1
      ORDER BY iml.created_at DESC
      LIMIT $2
    `, [restaurantId, limit]);

    res.json({
      ok: true,
      data: { history: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Get inventory history error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get inventory history',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get inventory history for a specific product
router.get('/history/:productId', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { productId } = req.params;

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    const { rows } = await query(`
      SELECT 
        iml.*
      FROM inventory_movement_log iml
      WHERE iml.restaurant_id = $1 AND iml.product_id = $2
      ORDER BY iml.created_at DESC
      LIMIT 100
    `, [restaurantId, productId]);

    res.json({
      ok: true,
      data: { history: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Get inventory history error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get history',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Adjust inventory (for wastage, spoilage, etc.)
router.post('/adjust', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { productId, ...data } = req.body;
    const adjustmentData = adjustInventorySchema.parse(data);

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    const result = await withTransaction(async (client) => {
      // Get current inventory
      const { rows: inventory } = await client.query(`
        SELECT quantity FROM restaurant_inventory
        WHERE restaurant_id = $1 AND product_id = $2
        FOR UPDATE
      `, [restaurantId, productId]);

      if (inventory.length === 0) {
        throw new NotFoundError('Product not found in inventory');
      }

      const balanceBefore = Number(inventory[0].quantity);
      const balanceAfter = Math.max(0, balanceBefore - adjustmentData.quantity);

      // Create adjustment record
      const { rows: [adjustment] } = await client.query(`
        INSERT INTO inventory_adjustment (
          restaurant_id, product_id, adjustment_type, quantity, reason, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        restaurantId, productId, adjustmentData.adjustmentType, 
        adjustmentData.quantity, adjustmentData.reason || null, req.userData.id
      ]);

      // Update inventory
      await client.query(`
        UPDATE restaurant_inventory
        SET quantity = $1, updated_at = now()
        WHERE restaurant_id = $2 AND product_id = $3
      `, [balanceAfter, restaurantId, productId]);

      // Log movement
      await client.query(`
        INSERT INTO inventory_movement_log (
          restaurant_id, product_id, type, quantity, 
          balance_before, balance_after, reason,
          reference_id, reference_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        restaurantId, productId, adjustmentData.adjustmentType,
        -adjustmentData.quantity, balanceBefore, balanceAfter,
        adjustmentData.reason || null, adjustment.id, 'ADJUSTMENT'
      ]);

      return adjustment;
    });

    logger.info('Inventory adjusted', { 
      productId,
      adjustmentType: adjustmentData.adjustmentType,
      quantity: adjustmentData.quantity,
      actor: req.userData.id 
    });

    res.status(201).json({
      ok: true,
      data: { adjustment: result },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Adjust inventory error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to adjust inventory',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Manually add inventory
router.post('/add', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { productId, quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      throw new ValidationError('Quantity must be positive');
    }

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    await withTransaction(async (client) => {
      // Get or create inventory
      const { rows: inventory } = await client.query(`
        SELECT quantity FROM restaurant_inventory
        WHERE restaurant_id = $1 AND product_id = $2
      `, [restaurantId, productId]);

      const balanceBefore = inventory.length > 0 ? Number(inventory[0].quantity) : 0;
      const balanceAfter = balanceBefore + quantity;

      if (inventory.length > 0) {
        await client.query(`
          UPDATE restaurant_inventory
          SET quantity = $1, updated_at = now()
          WHERE restaurant_id = $2 AND product_id = $3
        `, [balanceAfter, restaurantId, productId]);
      } else {
        await client.query(`
          INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity, updated_at)
          VALUES ($1, $2, $3, now())
        `, [restaurantId, productId, quantity]);
      }

      // Log movement
      await client.query(`
        INSERT INTO inventory_movement_log (
          restaurant_id, product_id, type, quantity, 
          balance_before, balance_after, reason
        ) VALUES ($1, $2, 'ADD', $3, $4, $5, $6)
      `, [restaurantId, productId, quantity, balanceBefore, balanceAfter, reason || null]);
    });

    logger.info('Inventory added', { 
      productId,
      quantity,
      actor: req.userData.id 
    });

    res.json({
      ok: true,
      data: { message: 'Inventory updated successfully' },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Add inventory error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to add inventory',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

export { router as restaurantInventoryRoutes };

