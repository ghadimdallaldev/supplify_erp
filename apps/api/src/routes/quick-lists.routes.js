import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query, withTransaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const createQuickListSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    supplierId: z.string().uuid(),
    quantity: z.number().positive(),
    notes: z.string().optional(),
  })).min(1),
});

const updateQuickListSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

const addItemSchema = z.object({
  productId: z.string().uuid(),
  supplierId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().optional(),
});

// Get all quick lists for restaurant
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
        ql.*,
        COUNT(qli.id) as item_count
      FROM quick_list ql
      LEFT JOIN quick_list_item qli ON qli.quick_list_id = ql.id
      WHERE ql.restaurant_id = $1
      GROUP BY ql.id
      ORDER BY ql.created_at DESC
    `, [restaurantId]);

    res.json({
      ok: true,
      data: { quickLists: rows },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Get quick lists error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get quick lists',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get quick list by ID with items
router.get('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    // Get quick list
    const { rows: lists } = await query(`
      SELECT * FROM quick_list WHERE id = $1 AND restaurant_id = $2
    `, [id, restaurantId]);

    if (lists.length === 0) {
      throw new NotFoundError('Quick list not found');
    }

    const quickList = lists[0];

    // Get items
    const { rows: items } = await query(`
      SELECT 
        qli.*,
        p.name as product_name,
        p.sku as product_sku,
        p.unit as product_unit,
        pr.amount as product_price,
        s.name as supplier_name
      FROM quick_list_item qli
      JOIN product p ON p.id = qli.product_id
      JOIN supplier s ON s.id = qli.supplier_id
      LEFT JOIN price pr ON pr.product_id = p.id 
        AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
      WHERE qli.quick_list_id = $1
      ORDER BY p.name
    `, [id]);

    res.json({
      ok: true,
      data: { 
        quickList: {
          ...quickList,
          items
        }
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Get quick list error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get quick list',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Create quick list
router.post('/', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const data = createQuickListSchema.parse(req.body);

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    const result = await withTransaction(async (client) => {
      // Create quick list
      const { rows: [quickList] } = await client.query(`
        INSERT INTO quick_list (restaurant_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [restaurantId, data.name, data.description || null]);

      // Create items
      const items = [];
      for (const item of data.items) {
        // Verify product belongs to supplier
        const { rows: products } = await client.query(`
          SELECT id FROM product WHERE id = $1 AND supplier_id = $2
        `, [item.productId, item.supplierId]);

        if (products.length === 0) {
          throw new ValidationError(`Product ${item.productId} does not belong to supplier ${item.supplierId}`);
        }

        const { rows: [quickListItem] } = await client.query(`
          INSERT INTO quick_list_item (quick_list_id, product_id, supplier_id, quantity, notes)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (quick_list_id, product_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            notes = EXCLUDED.notes,
            updated_at = now()
          RETURNING *
        `, [quickList.id, item.productId, item.supplierId, item.quantity, item.notes || null]);

        items.push(quickListItem);
      }

      return { ...quickList, items };
    });

    logger.info('Quick list created', { 
      quickListId: result.id, 
      restaurantId,
      itemCount: result.items.length,
      actor: req.userData.id 
    });

    res.status(201).json({
      ok: true,
      data: { quickList: result },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid quick list data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }

    logger.error({ 
      message: 'Create quick list error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create quick list',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Update quick list
router.patch('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const data = updateQuickListSchema.parse(req.body);

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (data.name) {
      updateFields.push(`name = $${paramIndex}`);
      updateValues.push(data.name);
      paramIndex++;
    }

    if (data.description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(data.description);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'No fields to update',
        },
        requestId: req.requestId,
      });
    }

    updateFields.push(`updated_at = now()`);
    updateValues.push(id, restaurantId);

    const { rows } = await query(`
      UPDATE quick_list 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND restaurant_id = $${paramIndex + 1}
      RETURNING *
    `, updateValues);

    if (rows.length === 0) {
      throw new NotFoundError('Quick list not found');
    }

    logger.info('Quick list updated', { 
      quickListId: id,
      actor: req.userData.id 
    });

    res.json({
      ok: true,
      data: { quickList: rows[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Update quick list error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update quick list',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Delete quick list
router.delete('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    const { rows } = await query(`
      DELETE FROM quick_list 
      WHERE id = $1 AND restaurant_id = $2
      RETURNING *
    `, [id, restaurantId]);

    if (rows.length === 0) {
      throw new NotFoundError('Quick list not found');
    }

    logger.info('Quick list deleted', { 
      quickListId: id,
      actor: req.userData.id 
    });

    res.json({
      ok: true,
      data: { quickList: rows[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Delete quick list error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to delete quick list',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Add item to quick list
router.post('/:id/items', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const data = addItemSchema.parse(req.body);

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    // Verify quick list belongs to restaurant
    const { rows: lists } = await query(`
      SELECT id FROM quick_list WHERE id = $1 AND restaurant_id = $2
    `, [id, restaurantId]);

    if (lists.length === 0) {
      throw new NotFoundError('Quick list not found');
    }

    // Verify product belongs to supplier
    const { rows: products } = await query(`
      SELECT id FROM product WHERE id = $1 AND supplier_id = $2
    `, [data.productId, data.supplierId]);

    if (products.length === 0) {
      throw new ValidationError('Product does not belong to supplier');
    }

    const { rows } = await query(`
      INSERT INTO quick_list_item (quick_list_id, product_id, supplier_id, quantity, notes)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (quick_list_id, product_id) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING *
    `, [id, data.productId, data.supplierId, data.quantity, data.notes || null]);

    logger.info('Item added to quick list', { 
      quickListId: id,
      productId: data.productId,
      actor: req.userData.id 
    });

    res.status(201).json({
      ok: true,
      data: { item: rows[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Add item to quick list error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to add item to quick list',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Delete item from quick list
router.delete('/:id/items/:itemId', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found');
    }

    const restaurantId = restaurants[0].id;

    // Verify quick list belongs to restaurant
    const { rows: lists } = await query(`
      SELECT id FROM quick_list WHERE id = $1 AND restaurant_id = $2
    `, [id, restaurantId]);

    if (lists.length === 0) {
      throw new NotFoundError('Quick list not found');
    }

    const { rows } = await query(`
      DELETE FROM quick_list_item 
      WHERE id = $1 AND quick_list_id = $2
      RETURNING *
    `, [itemId, id]);

    if (rows.length === 0) {
      throw new NotFoundError('Item not found');
    }

    logger.info('Item removed from quick list', { 
      quickListId: id,
      itemId,
      actor: req.userData.id 
    });

    res.json({
      ok: true,
      data: { item: rows[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Remove item from quick list error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to remove item from quick list',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

export { router as quickListsRoutes };

