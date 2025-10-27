import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query, withTransaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../middlewares/errorHandler.js';

const router = express.Router();

// Get delivered orders ready for receiving
router.get('/pending-orders', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    // Get restaurant ID
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Restaurant not found',
        },
        requestId: req.requestId,
      });
    }

    const restaurantId = restaurants[0].id;

    // Get orders that are delivered but not yet received
    // Note: supplier_id is in order_item, not customer_order
    const { rows: orders } = await query(`
      SELECT DISTINCT ON (o.id)
        o.*,
        s.name as supplier_name,
        s.contact_email as supplier_email,
        COALESCE(rr.id IS NOT NULL, false) as has_receiving_report
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id
      JOIN supplier s ON s.id = oi.supplier_id
      LEFT JOIN receiving_report rr ON rr.order_id = o.id
      WHERE o.restaurant_id = $1 
        AND o.status = 'COMPLETED'
        AND NOT EXISTS (
          SELECT 1 FROM receiving_report 
          WHERE order_id = o.id 
            AND status IN ('ACCEPTED', 'REJECTED')
        )
      ORDER BY o.id, o.created_at DESC
    `, [restaurantId]);

    // For each order, fetch its items
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const { rows: items } = await query(`
          SELECT 
            oi.*,
            p.name as product_name,
            p.sku,
            p.unit
          FROM order_item oi
          JOIN product p ON p.id = oi.product_id
          WHERE oi.order_id = $1
        `, [order.id]);

        return {
          ...order,
          items: items.map(item => ({
            ...item,
            ordered_quantity: parseFloat(item.quantity),
            received_quantity: 0,
            quality_status: 'PENDING',
          })),
        };
      })
    );

    res.json({
      ok: true,
      data: { orders: ordersWithItems },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({
      message: 'Get pending orders for receiving error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get pending orders',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Create receiving report
router.post('/receive', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { orderId, lineItems, deliveryNotes, qualityScore, qualityNotes, receivedBy } = req.body;

    // Get restaurant ID first
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Restaurant not found',
        },
        requestId: req.requestId,
      });
    }

    const restaurantId = restaurants[0].id;

    // Get order details
    const { rows: orders } = await query(`
      SELECT * FROM customer_order WHERE id = $1 AND restaurant_id = $2
    `, [orderId, restaurantId]);

    if (orders.length === 0) {
      throw new NotFoundError('Order not found');
    }

    const order = orders[0];
    
    // Get supplier_id from the first order_item
    const { rows: items } = await query(`
      SELECT DISTINCT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1
    `, [orderId]);
    
    if (items.length === 0) {
      throw new NotFoundError('Order items not found');
    }
    
    const supplierId = items[0].supplier_id;

    // Calculate totals
    const totalItemsOrdered = lineItems.reduce((sum, item) => sum + parseFloat(item.ordered_quantity || 0), 0);
    const totalItemsReceived = lineItems.reduce((sum, item) => sum + parseFloat(item.received_quantity || 0), 0);
    const totalExpectedCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.ordered_quantity || 0) * parseFloat(item.expected_unit_price || 0)), 0);
    const totalActualCost = lineItems.reduce((sum, item) => sum + (parseFloat(item.received_quantity || 0) * parseFloat(item.actual_unit_price || parseFloat(item.expected_unit_price || 0))), 0);

    // Determine status
    let status = 'ACCEPTED';
    if (totalItemsReceived < totalItemsOrdered) {
      status = 'PARTIAL';
    }

    // Execute within transaction
    const result = await withTransaction(async (client) => {
      // Create receiving report
      const { rows: reports } = await client.query(`
        INSERT INTO receiving_report (
          order_id, restaurant_id, supplier_id, received_by,
          total_items_ordered, total_items_received,
          total_expected_cost, total_actual_cost,
          quality_score, quality_notes, delivery_notes, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        orderId, restaurantId, supplierId, receivedBy || req.userData.id,
        totalItemsOrdered, totalItemsReceived,
        totalExpectedCost, totalActualCost,
        qualityScore, qualityNotes, deliveryNotes, status
      ]);

      const report = reports[0];

      // Create receiving line items
      for (const item of lineItems) {
        await client.query(`
          INSERT INTO receiving_line_item (
            receiving_report_id, product_id, order_item_id,
            product_name, product_sku, ordered_quantity, received_quantity,
            unit, expected_unit_price, actual_unit_price,
            quality_status, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          report.id, item.productId, item.orderItemId,
          item.product_name, item.sku, item.ordered_quantity, item.received_quantity,
          item.unit || 'unit', item.expected_unit_price, item.actual_unit_price || item.expected_unit_price,
          item.quality_status, item.notes || ''
        ]);

        // Update restaurant inventory if item is accepted and has quantity
        if (item.quality_status === 'ACCEPTED' && parseFloat(item.received_quantity || 0) > 0) {
          const { rows: existingInventory } = await client.query(`
            SELECT * FROM restaurant_inventory 
            WHERE restaurant_id = $1 AND product_id = $2
          `, [restaurantId, item.productId]);

          if (existingInventory.length > 0) {
            // Update existing inventory
            await client.query(`
              UPDATE restaurant_inventory 
              SET quantity = quantity + $1,
                  last_restocked_at = now(),
                  updated_at = now()
              WHERE id = $2
            `, [item.received_quantity, existingInventory[0].id]);
          } else {
            // Create new inventory entry
            await client.query(`
              INSERT INTO restaurant_inventory (
                restaurant_id, product_id, quantity, last_restocked_at
              )
              VALUES ($1, $2, $3, now())
            `, [restaurantId, item.productId, item.received_quantity]);
          }

          // Add inventory movement log
          await client.query(`
            INSERT INTO inventory_movement_log (
              restaurant_id, product_id, type, quantity, reason, reference_id, reference_type
            )
            VALUES ($1, $2, 'RECEIVED', $3, $4, $5, 'RECEIVING_REPORT')
          `, [restaurantId, item.productId, item.received_quantity, 'Order received', report.id]);
        }
      }

      return report;
    });

    res.status(201).json({
      ok: true,
      data: { report: result },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({
      message: 'Create receiving report error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create receiving report',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get receiving history
router.get('/history', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Restaurant not found',
        },
        requestId: req.requestId,
      });
    }

    const restaurantId = restaurants[0].id;

    const { rows: reports } = await query(`
      SELECT 
        rr.*,
        o.id as order_id,
        o.created_at as order_created_at,
        s.name as supplier_name,
        COUNT(rli.id) as line_item_count
      FROM receiving_report rr
      JOIN customer_order o ON o.id = rr.order_id
      JOIN supplier s ON s.id = rr.supplier_id
      LEFT JOIN receiving_line_item rli ON rli.receiving_report_id = rr.id
      WHERE rr.restaurant_id = $1
      GROUP BY rr.id, o.id, o.created_at, s.name
      ORDER BY rr.received_at DESC
      LIMIT 50
    `, [restaurantId]);

    res.json({
      ok: true,
      data: { reports },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({
      message: 'Get receiving history error',
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get receiving history',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

export { router as receivingRoutes };

