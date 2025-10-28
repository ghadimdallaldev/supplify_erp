import express from 'express';
import { requireAuth, requireRole, requireOwnership } from '../lib/rbac.js';
import { query, withTransaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js';
import { z } from 'zod';
import { notifyOrderStatusChange } from '../services/notification.service.js';

const router = express.Router();

// Validation schemas
const orderCreateSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    notes: z.string().optional(),
  })).min(1),
});

const supplierOrderCreateSchema = z.object({
  restaurant_id: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
    notes: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
});

const orderUpdateSchema = z.object({
  status: z.enum(['DRAFT', 'PLACED', 'CONFIRMED', 'FULFILLING', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
});

const orderListSchema = z.object({
  status: z.string().optional(),
  supplier: z.string().uuid().optional(),
  limit: z.string().transform(val => parseInt(val, 10)).default('20'),
  offset: z.string().transform(val => parseInt(val, 10)).default('0'),
});

// Helper function to create invoice from delivered order
async function createInvoiceFromOrder(order, orderItems, supplierId, client) {
  try {
    // Check if invoice already exists for this order
    const { rows: existingInvoices } = await client.query(`
      SELECT id FROM invoice WHERE order_id = $1
    `, [order.id]);
    
    if (existingInvoices.length > 0) {
      logger.info('Invoice already exists for order', { orderId: order.id });
      return null;
    }
    
    // Generate invoice number
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
    
    // Calculate due date (30 days from delivery)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    
    // Calculate total amount
    let totalAmount = 0;
    for (const item of orderItems) {
      const lineTotal = parseFloat(item.unit_price) * parseFloat(item.quantity);
      totalAmount += lineTotal;
    }
    
    // Create invoice
    const { rows: invoices } = await client.query(`
      INSERT INTO invoice (
        supplier_id, restaurant_id, order_id, invoice_number,
        issue_date, due_date, status, total_amount, amount_due,
        currency, tax_amount, discount_amount, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ISSUED', $7, $7, 'USD', 0, 0, NULL)
      RETURNING *
    `, [supplierId, order.restaurant_id, order.id, invoiceNumber, new Date(), dueDate, totalAmount]);
    
    const invoice = invoices[0];
    
    // Create invoice line items
    for (const item of orderItems) {
      const lineTotal = parseFloat(item.unit_price) * parseFloat(item.quantity);
      
      await client.query(`
        INSERT INTO invoice_line_item (
          invoice_id, product_id, description, quantity, unit_price, line_total
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        invoice.id,
        item.product_id,
        item.notes || `Product ordered`,
        item.quantity,
        item.unit_price,
        lineTotal
      ]);
    }
    
    logger.info('Invoice created from order', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      orderId: order.id,
      totalAmount
    });
    
    return invoice;
  } catch (error) {
    logger.error('Error creating invoice from order', { error: error.message, orderId: order.id });
    // Don't throw - invoice creation is non-critical
    return null;
  }
}

// Helper function to handle order delivery and update restaurant inventory
async function handleOrderDelivery(orderId, userData, res) {
  try {
    const result = await withTransaction(async (client) => {
      // Update order status
      const { rows: orders } = await client.query(`
        UPDATE customer_order 
        SET status = 'COMPLETED', updated_at = now()
        WHERE id = $1
        RETURNING *
      `, [orderId]);
      
      if (orders.length === 0) {
        throw new NotFoundError('Order not found');
      }
      
      const order = orders[0];
      
      // Get order items
      const { rows: orderItems } = await client.query(`
        SELECT oi.*, p.supplier_id, p.name as product_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        WHERE oi.order_id = $1
      `, [orderId]);
      
      // Verify supplier owns all items in this order
      const { rows: suppliers } = await client.query(
        'SELECT id FROM supplier WHERE contact_email = $1',
        [userData.email]
      );
      
      if (suppliers.length === 0) {
        throw new ValidationError('Supplier not found');
      }
      
      const supplierId = suppliers[0].id;
      
      // Check all items belong to this supplier
      for (const item of orderItems) {
        if (item.supplier_id !== supplierId) {
          throw new ValidationError('Order contains items from other suppliers');
        }
      }
      
      // Update restaurant inventory for each item
      for (const item of orderItems) {
        // Check if restaurant inventory exists for this product
        const { rows: restaurantInventory } = await client.query(`
          SELECT * FROM restaurant_inventory 
          WHERE restaurant_id = $1 AND product_id = $2
        `, [order.restaurant_id, item.product_id]);
        
        if (restaurantInventory.length > 0) {
          // Update existing inventory
          await client.query(`
            UPDATE restaurant_inventory 
            SET quantity = quantity + $1, updated_at = now()
            WHERE restaurant_id = $2 AND product_id = $3
          `, [item.quantity, order.restaurant_id, item.product_id]);
        } else {
          // Create new inventory record
          await client.query(`
            INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity, updated_at)
            VALUES ($1, $2, $3, now())
          `, [order.restaurant_id, item.product_id, item.quantity]);
        }
      }
      
      // Create invoice from delivered order
      const invoice = await createInvoiceFromOrder(order, orderItems, supplierId, client);
      
      logger.info('Order delivered and restaurant inventory updated', { 
        orderId: order.id,
        restaurantId: order.restaurant_id,
        itemCount: orderItems.length,
        actor: userData.id 
      });
      
      return { order, supplierId };
    });
    
    // Send notification to restaurant about completed order
    try {
      const { rows: restaurantInfo } = await query(`
        SELECT id, name FROM restaurant WHERE id = $1
      `, [result.order.restaurant_id]);
      
      const { rows: supplierInfo } = await query(`
        SELECT id, name FROM supplier WHERE id = $1
      `, [result.supplierId]);
      
      await notifyOrderStatusChange({
        id: result.order.id,
        total_amount: result.order.total_amount,
        restaurant_id: result.order.restaurant_id,
        supplier_id: result.supplierId,
        supplier_name: supplierInfo[0]?.name || 'Supplier',
      }, 'COMPLETED');
    } catch (notifError) {
      logger.error('Failed to send completion notification', { error: notifError.message });
    }
    
    res.json({
      ok: true,
      data: { order: result.order },
      error: null,
      requestId: res.locals.requestId,
    });
  } catch (error) {
    console.error('❌ Handle order delivery error:', error.message);
    console.error('Stack:', error.stack);
    logger.error('Handle order delivery error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to deliver order',
      },
      requestId: res.locals.requestId,
    });
  }
}

// List orders (role-aware)
router.get('/', requireAuth, async (req, res) => {
  try {
    const params = orderListSchema.parse(req.query);
    
    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;
    
    // Role-based filtering
    if (req.userData.role === 'RESTAURANT') {
      // Restaurants see only their own orders
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      );
      
      if (restaurants.length === 0) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Restaurant record not found for user',
          },
          requestId: req.requestId,
        });
      }
      
      whereConditions.push(`o.restaurant_id = $${paramIndex}`);
      queryParams.push(restaurants[0].id);
      paramIndex++;
    } else if (req.userData.role === 'SUPPLIER') {
      // Suppliers see orders that include their products
      const { rows: suppliers } = await query(
        'SELECT id FROM supplier WHERE contact_email = $1',
        [req.userData.email]
      );
      
      if (suppliers.length === 0) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Supplier record not found for user',
          },
          requestId: req.requestId,
        });
      }
      
      whereConditions.push(`p.supplier_id = $${paramIndex}`);
      queryParams.push(suppliers[0].id);
      paramIndex++;
    }
    // Admin sees all orders (no additional filter)
    
    // Status filter
    if (params.status) {
      whereConditions.push(`o.status = $${paramIndex}`);
      queryParams.push(params.status);
      paramIndex++;
    }
    
    // Supplier filter (for admin)
    if (params.supplier && req.userData.role === 'ADMIN') {
      whereConditions.push(`p.supplier_id = $${paramIndex}`);
      queryParams.push(params.supplier);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    const sql = `
      SELECT DISTINCT
        o.*,
        r.name as restaurant_name,
        r.slug as restaurant_slug
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      LEFT JOIN order_item oi ON oi.order_id = o.id
      LEFT JOIN product p ON p.id = oi.product_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(params.limit, params.offset);
    
    const { rows } = await query(sql, queryParams);
    
    // Get items for each order
    const orderIds = rows.map(order => order.id);
    let items = [];
    if (orderIds.length > 0) {
      try {
        logger.info({ 
          message: 'Fetching items for orders',
          orderIds,
          count: orderIds.length 
        });
        
        const { rows: itemsRows } = await query(`
          SELECT 
            oi.*,
            p.name as product_name,
            p.sku as product_sku
          FROM order_item oi
          JOIN product p ON p.id = oi.product_id
          WHERE oi.order_id = ANY($1)
        `, [orderIds]);
        
        items = itemsRows;
        logger.info({ 
          message: 'Fetched order items',
          count: items.length 
        });
      } catch (itemError) {
        logger.error({ 
          message: 'Failed to fetch order items',
          error: itemError.message,
          stack: itemError.stack 
        });
        // Continue without items if query fails
      }
    }
    
    // Group items by order_id
    const itemsByOrder = {};
    items.forEach(item => {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = [];
      }
      itemsByOrder[item.order_id].push(item);
    });
    
    // Attach items to each order
    const ordersWithItems = rows.map(order => ({
      ...order,
      items: itemsByOrder[order.id] || []
    }));
    
    // Get total count for pagination
    const countSql = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM customer_order o
      LEFT JOIN order_item oi ON oi.order_id = o.id
      LEFT JOIN product p ON p.id = oi.product_id
      ${whereClause}
    `;
    
    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const { rows: countRows } = await query(countSql, countParams);
    
    res.json({
      ok: true,
      data: {
        orders: ordersWithItems,
        pagination: {
          total: parseInt(countRows[0].total),
          limit: params.limit,
          offset: params.offset,
        },
      },
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
          message: 'Invalid query parameters',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error({ 
      message: 'List orders error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list orders',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get order by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order with items
    const { rows: orders } = await query(`
      SELECT 
        o.*,
        r.name as restaurant_name,
        r.slug as restaurant_slug
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      WHERE o.id = $1
    `, [id]);
    
    if (orders.length === 0) {
      throw new NotFoundError('Order not found');
    }
    
    const order = orders[0];
    
    // Check access permissions
    if (req.userData.role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      );
      
      if (restaurants.length === 0 || restaurants[0].id !== order.restaurant_id) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        });
      }
    } else if (req.userData.role === 'SUPPLIER') {
      // Check if supplier has items in this order
      const { rows: supplierItems } = await query(`
        SELECT 1 FROM order_item oi
        JOIN supplier s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1 AND s.contact_email = $2
        LIMIT 1
      `, [id, req.userData.email]);
      
      if (supplierItems.length === 0) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        });
      }
    }
    
    // Get order items
    const { rows: items } = await query(`
      SELECT 
        oi.*,
        p.name as product_name,
        p.sku as product_sku,
        s.name as supplier_name,
        s.slug as supplier_slug
      FROM order_item oi
      JOIN product p ON p.id = oi.product_id
      JOIN supplier s ON s.id = oi.supplier_id
      WHERE oi.order_id = $1
      ORDER BY s.name, p.name
    `, [id]);
    
    res.json({
      ok: true,
      data: {
        order: {
          ...order,
          items,
        },
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get order error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get order',
      },
      requestId: req.requestId,
    });
  }
});

// Create order (restaurant only)
router.post('/', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const orderData = orderCreateSchema.parse(req.body);
    
    // Get restaurant ID
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );
    
    if (restaurants.length === 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Restaurant record not found for user',
        },
        requestId: req.requestId,
      });
    }
    
    const restaurantId = restaurants[0].id;
    
    // Create order with transaction
    const result = await withTransaction(async (client) => {
      // Create order
      const { rows: [order] } = await client.query(`
        INSERT INTO customer_order (restaurant_id, currency, status)
        VALUES ($1, 'USD', 'PLACED')
        RETURNING *
      `, [restaurantId]);
      
      let totalAmount = 0;
      const orderItems = [];
      
      // Process each item
      for (const item of orderData.items) {
        // Get product and current price
        const { rows: products } = await client.query(`
          SELECT p.*, pr.amount as current_price, pr.currency
          FROM product p
          LEFT JOIN price pr ON pr.product_id = p.id 
            AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
          WHERE p.id = $1
        `, [item.productId]);
        
        if (products.length === 0) {
          throw new ValidationError(`Product ${item.productId} not found`);
        }
        
        const product = products[0];
        
        if (!product.current_price) {
          throw new ValidationError(`No valid price found for product ${product.sku}`);
        }
        
        // Check inventory
        const { rows: inventory } = await client.query(
          'SELECT available_qty FROM inventory WHERE product_id = $1 FOR UPDATE',
          [item.productId]
        );
        
        if (inventory.length === 0 || Number(inventory[0].available_qty) < item.quantity) {
          throw new ValidationError(`Insufficient inventory for product ${product.sku}`);
        }
        
        // Calculate line total
        const unitPrice = Number(product.current_price);
        const lineTotal = unitPrice * item.quantity;
        totalAmount += lineTotal;
        
        // Create order item
        const { rows: [orderItem] } = await client.query(`
          INSERT INTO order_item (
            order_id, product_id, supplier_id, quantity, unit_price, line_total, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          order.id,
          item.productId,
          product.supplier_id,
          item.quantity,
          unitPrice,
          lineTotal,
          item.notes,
        ]);
        
        orderItems.push(orderItem);
        
        // Update inventory
        await client.query(`
          UPDATE inventory 
          SET available_qty = available_qty - $1, updated_at = now()
          WHERE product_id = $2
        `, [item.quantity, item.productId]);
      }
      
      // Update order total
      await client.query(`
        UPDATE customer_order 
        SET total_amount = $1, placed_at = now()
        WHERE id = $2
      `, [totalAmount, order.id]);
      
      return { ...order, total_amount: totalAmount, items: orderItems };
    });
    
    logger.info('Order created', { 
      orderId: result.id, 
      restaurantId: result.restaurant_id,
      totalAmount: result.total_amount,
      itemCount: result.items.length,
      actor: req.userData.id 
    });
    
    // Send notification to supplier about new order
    try {
      // Get supplier ID from first order item
      const firstSupplierId = result.items[0]?.supplier_id;
      if (firstSupplierId) {
        await notifyOrderStatusChange({
          id: result.id,
          total_amount: result.total_amount,
          restaurant_id: result.restaurant_id,
          supplier_id: firstSupplierId,
        }, 'PLACED');
      }
    } catch (notifError) {
      // Don't fail order creation if notification fails
      logger.error('Failed to send order notification', { error: notifError.message });
    }
    
    res.status(201).json({
      ok: true,
      data: { order: result },
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
          message: 'Invalid order data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error('Create order error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create order',
      },
      requestId: req.requestId,
    });
  }
});

// Create order manually by supplier (for phone orders, chat orders, etc.)
router.post('/manual', requireAuth, requireRole(['SUPPLIER']), async (req, res) => {
  try {
    const orderData = supplierOrderCreateSchema.parse(req.body);
    
    // Get supplier ID
    const { rows: suppliers } = await query(
      'SELECT id FROM supplier WHERE contact_email = $1',
      [req.userData.email]
    );
    
    if (suppliers.length === 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Supplier record not found for user',
        },
        requestId: req.requestId,
      });
    }
    
    const supplierId = suppliers[0].id;
    
    // Verify restaurant exists
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE id = $1',
      [orderData.restaurant_id]
    );
    
    if (restaurants.length === 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Restaurant not found',
        },
        requestId: req.requestId,
      });
    }
    
    // Create order with transaction
    const result = await withTransaction(async (client) => {
      // Create order with status PLACED
      const { rows: [order] } = await client.query(`
        INSERT INTO customer_order (restaurant_id, currency, status, notes)
        VALUES ($1, 'USD', 'PLACED', $2)
        RETURNING *
      `, [orderData.restaurant_id, orderData.notes || null]);
      
      let totalAmount = 0;
      const orderItems = [];
      
      // Process each item
      for (const item of orderData.items) {
        // Get product and current price
        const { rows: products } = await client.query(`
          SELECT p.*, pr.amount as current_price, pr.currency
          FROM product p
          LEFT JOIN price pr ON pr.product_id = p.id 
            AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
          WHERE p.id = $1 AND p.supplier_id = $2
        `, [item.productId, supplierId]);
        
        if (products.length === 0) {
          throw new ValidationError(`Product ${item.productId} not found or doesn't belong to supplier`);
        }
        
        const product = products[0];
        
        if (!product.current_price) {
          throw new ValidationError(`No valid price found for product ${product.sku}`);
        }
        
        // Check inventory
        const { rows: inventory } = await client.query(
          'SELECT available_qty FROM inventory WHERE product_id = $1 FOR UPDATE',
          [item.productId]
        );
        
        if (inventory.length === 0 || Number(inventory[0].available_qty) < item.quantity) {
          throw new ValidationError(`Insufficient inventory for product ${product.sku}`);
        }
        
        // Calculate line total
        const unitPrice = Number(product.current_price);
        const lineTotal = unitPrice * item.quantity;
        totalAmount += lineTotal;
        
        // Create order item
        const { rows: [orderItem] } = await client.query(`
          INSERT INTO order_item (
            order_id, product_id, supplier_id, quantity, unit_price, line_total, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          order.id,
          item.productId,
          supplierId,
          item.quantity,
          unitPrice,
          lineTotal,
          item.notes,
        ]);
        
        orderItems.push(orderItem);
        
        // Reserve inventory (decrease available, increase reserved)
        await client.query(`
          UPDATE inventory 
          SET available_qty = available_qty - $1,
              reserved_qty = reserved_qty + $1,
              updated_at = now()
          WHERE product_id = $2
        `, [item.quantity, item.productId]);
      }
      
      // Update order total
      await client.query(`
        UPDATE customer_order 
        SET total_amount = $1, placed_at = now()
        WHERE id = $2
      `, [totalAmount, order.id]);
      
      return { ...order, total_amount: totalAmount, items: orderItems };
    });
    
    logger.info('Manual order created by supplier', { 
      orderId: result.id, 
      restaurantId: result.restaurant_id,
      totalAmount: result.total_amount,
      itemCount: result.items.length,
      actor: req.userData.id 
    });
    
    res.status(201).json({
      ok: true,
      data: { order: result },
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
          message: 'Invalid order data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error('Create manual order error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create order',
      },
      requestId: req.requestId,
    });
  }
});

// Update order status
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info('Order update request', { id, body: req.body, contentType: req.headers['content-type'] });
    let updateData;
    try {
      updateData = orderUpdateSchema.parse(req.body);
    } catch (validationError) {
      console.error('❌ Validation error:', validationError.errors);
      console.error('Body:', req.body);
      logger.error('Validation error', { error: validationError.message, body: req.body, errors: validationError.errors });
      throw validationError;
    }
    
    // Get order
    const { rows: orders } = await query(`
      SELECT * FROM customer_order WHERE id = $1
    `, [id]);
    
    if (orders.length === 0) {
      throw new NotFoundError('Order not found');
    }
    
    const order = orders[0];
    
    // Get supplier_id from order items (first item's supplier)
    const { rows: firstItem } = await query(`
      SELECT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1
    `, [id]);
    
    const supplier_id = firstItem.length > 0 ? firstItem[0].supplier_id : null;
    
    // Add supplier_id to order object for notification logic
    order.supplier_id = supplier_id;
    
    // Check permissions based on role and status transition
    if (req.userData.role === 'RESTAURANT') {
      // Restaurants can only cancel their own orders
      if (updateData.status && updateData.status !== 'CANCELLED') {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Restaurants can only cancel orders',
          },
          requestId: req.requestId,
        });
      }
      
      // Verify ownership
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      );
      
      if (restaurants.length === 0 || restaurants[0].id !== order.restaurant_id) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        });
      }
         } else if (req.userData.role === 'SUPPLIER') {
       // Suppliers can confirm and fulfill orders
       if (updateData.status && !['CONFIRMED', 'FULFILLING', 'COMPLETED'].includes(updateData.status)) {
         return res.status(403).json({
           ok: false,
           data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Suppliers can only confirm, fulfill, or complete orders',
          },
           requestId: req.requestId,
         });
       }
       
       // If completing, update restaurant inventory
       if (updateData.status === 'COMPLETED') {
         return await handleOrderDelivery(id, req.userData, res);
       }
     }
    
    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    
    if (updateData.status) {
      updateFields.push(`status = $${paramIndex}`);
      updateValues.push(updateData.status);
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
    
    // Now add the WHERE clause with the order id
    updateValues.push(id);
    
    const { rows } = await query(`
      UPDATE customer_order 
      SET ${updateFields.join(', ')}
      WHERE id = $${updateValues.length}
      RETURNING *
    `, updateValues);
    
    logger.info('Order updated', { 
      orderId: rows[0].id, 
      status: rows[0].status,
      actor: req.userData.id 
    });
    
    // Send notification if status changed
    if (updateData.status && updateData.status !== order.status) {
      try {
        // Get supplier_id from order items (order.supplier_id was set earlier in the function)
        const supplierIdForNotification = order.supplier_id;
        
        // Get restaurant and supplier info
        const { rows: restaurantInfo } = await query(`
          SELECT id, name FROM restaurant WHERE id = $1
        `, [rows[0].restaurant_id]);
        
        const { rows: supplierInfo } = await query(`
          SELECT id, name FROM supplier WHERE id = $1
        `, [supplierIdForNotification]);
        
        // Notify both parties based on status
        if (updateData.status === 'PLACED') {
          // New order - notify supplier
          await notifyOrderStatusChange({
            id: rows[0].id,
            total_amount: rows[0].total_amount,
            restaurant_id: rows[0].restaurant_id,
            restaurant_name: restaurantInfo[0]?.name || 'Restaurant',
            supplier_id: supplierIdForNotification,
          }, updateData.status);
        } else if (updateData.status === 'CANCELLED') {
          // Cancelled - notify supplier
          await notifyOrderStatusChange({
            id: rows[0].id,
            total_amount: rows[0].total_amount,
            restaurant_id: rows[0].restaurant_id,
            restaurant_name: restaurantInfo[0]?.name || 'Restaurant',
            supplier_id: supplierIdForNotification,
            supplier_name: supplierInfo[0]?.name || 'Supplier',
          }, updateData.status);
        } else {
          // All other status changes - notify restaurant
          await notifyOrderStatusChange({
            id: rows[0].id,
            total_amount: rows[0].total_amount,
            restaurant_id: rows[0].restaurant_id,
            supplier_id: supplierIdForNotification,
            supplier_name: supplierInfo[0]?.name || 'Supplier',
          }, updateData.status);
        }
      } catch (notifError) {
        // Don't fail the order update if notification fails
        logger.error('Failed to send notification', { error: notifError.message });
      }
    }
    
    res.json({
      ok: true,
      data: { order: rows[0] },
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
          message: 'Invalid update data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    console.error('❌ Update order error:', error.message);
    console.error('Stack:', error.stack);
    logger.error('Update order error:', {
      message: error.message,
      stack: error.stack,
      details: error.details,
      code: error.code,
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update order',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

export { router as ordersRoutes };
