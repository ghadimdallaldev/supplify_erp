import express from 'express';
import { requireAuth, requireRole, requireOwnership } from '../lib/rbac.js';
import { query, withTransaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js';
import { checkLimit, incrementUsage } from '../lib/subscription.js';
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
  status: z.enum(['DRAFT', 'PLACED']).default('PLACED'),
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
  status: z.enum(['DRAFT', 'PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
});

const orderListSchema = z.object({
  status: z.string().optional(),
  supplier: z.string().uuid().optional(),
  limit: z.string().transform(val => parseInt(val, 10)).default('20'),
  offset: z.string().transform(val => parseInt(val, 10)).default('0'),
});

// Helper function to create invoice from delivered order
export async function createInvoiceFromOrder(order, orderItems, supplierId, client) {
  try {
    // Use a savepoint so failures don't abort the outer transaction
    await client.query('SAVEPOINT invoice_create_sp');
    // Check if invoice already exists for this supplier and order (multi-supplier support)
    const { rows: existingInvoices } = await client.query(`
      SELECT id FROM invoice WHERE order_id = $1 AND supplier_id = $2
    `, [order.id, supplierId]);
    
    if (existingInvoices.length > 0) {
      logger.info('Invoice already exists for this supplier and order', { orderId: order.id, supplierId });
      return null;
    }
    
    // Get comprehensive supplier data (name, address, etc.)
    const { rows: suppliers } = await client.query(`
      SELECT s.* FROM supplier s WHERE s.id = $1
    `, [supplierId]);
    
    if (suppliers.length === 0) {
      logger.error('Supplier not found for invoice creation', { supplierId });
      return null;
    }
    
    // Get tax configuration for supplier (if available)
    const { rows: taxConfigs } = await client.query(`
      SELECT tax_rate, tax_type, tax_name
      FROM tax_config
      WHERE supplier_id = $1 AND is_active = true
        AND effective_from <= CURRENT_DATE
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY effective_from DESC
      LIMIT 1
    `, [supplierId]);
    
    const taxConfig = taxConfigs.length > 0 ? taxConfigs[0] : { tax_rate: 0, tax_type: 'SALES_TAX', tax_name: 'Tax' };
    const taxRate = parseFloat(taxConfig.tax_rate || 0);
    
    // Generate invoice number using supplier-specific sequence or default
    let invoiceNumber;
    try {
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      
      // Try to use invoice sequence table if available
      const { rows: sequences } = await client.query(`
        INSERT INTO invoice_sequence (supplier_id, year, month, current_number, next_number)
        VALUES ($1, $2, $3, 0, 1)
        ON CONFLICT (supplier_id, year, month) 
        DO UPDATE SET next_number = invoice_sequence.next_number + 1
        RETURNING next_number, prefix, format
      `, [supplierId, year, month]);
      
      if (sequences.length > 0) {
        const seq = sequences[0];
        const number = String(seq.next_number).padStart(6, '0');
        invoiceNumber = `${seq.prefix || 'INV'}-${year}-${String(month).padStart(2, '0')}-${number}`;
      } else {
        invoiceNumber = `INV-${year}-${String(month).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
      }
    } catch (seqError) {
      // Fallback if sequence table doesn't exist
      logger.warn('Invoice sequence generation failed, using timestamp', { error: seqError.message });
      invoiceNumber = `INV-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
    }
    
    // Calculate invoice dates
    const invoiceDate = new Date();
    const issueDate = new Date();
    const paymentTermsDays = 30; // Could be fetched from supplier settings
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);
    
    // Calculate amounts with comprehensive line item details
    let subtotal = 0;
    const lineItemsData = [];
    
    for (const item of orderItems) {
      // Get full product details
      const { rows: products } = await client.query(`
        SELECT p.* FROM product p WHERE p.id = $1
      `, [item.product_id]);
      
      const product = products.length > 0 ? products[0] : null;
      const unitPrice = parseFloat(item.unit_price || 0);
      const quantity = parseFloat(item.quantity || 0);
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      
      lineItemsData.push({
        product_id: item.product_id,
        description: product?.name || item.product_name || 'Product',
        sku: product?.sku || 'N/A',
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        tax_rate: taxRate,
        tax_amount: (lineTotal * taxRate) / 100,
        order_item_id: item.id,
      });
    }
    
    // Calculate tax (assuming tax is NOT included in subtotal)
    const taxAmount = (subtotal * taxRate) / 100;
    const totalAmount = subtotal + taxAmount;
    
    // Create invoice with comprehensive data
    const { rows: invoices } = await client.query(`
      INSERT INTO invoice (
        invoice_number, supplier_id, restaurant_id, order_id,
        invoice_date, issue_date, due_date,
        subtotal, tax_amount, tax_rate, tax_included, total_amount,
        balance_due, paid_amount,
        status, currency,
        payment_terms_days,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      invoiceNumber,
      supplierId,
      order.restaurant_id,
      order.id,
      invoiceDate,
      issueDate,
      dueDate,
      subtotal,
      taxAmount,
      taxRate,
      false, // tax_included
      totalAmount,
      totalAmount, // balance_due initially equals total
      0, // paid_amount
      'ISSUED',
      order.currency || 'USD',
      paymentTermsDays,
      `Invoice for Order #${order.id.slice(0, 8)} - Placed: ${new Date(order.placed_at || order.created_at).toLocaleDateString()}`,
    ]);
    
    const invoice = invoices[0];
    
    // Create comprehensive invoice line items
    for (const lineItem of lineItemsData) {
      await client.query(`
        INSERT INTO invoice_line_item (
          invoice_id, product_id, description, sku,
          quantity, unit_price, line_total,
          tax_rate, tax_amount,
          order_item_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        invoice.id,
        lineItem.product_id,
        lineItem.description,
        lineItem.sku,
        lineItem.quantity,
        lineItem.unit_price,
        lineItem.line_total,
        lineItem.tax_rate,
        lineItem.tax_amount,
        lineItem.order_item_id,
      ]);
    }
    // Release savepoint on success
    await client.query('RELEASE SAVEPOINT invoice_create_sp');
    
    logger.info('Comprehensive invoice created from order', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      orderId: order.id,
      supplierId,
      restaurantId: order.restaurant_id,
      subtotal,
      taxAmount,
      totalAmount,
      lineItemsCount: lineItemsData.length,
    });
    
    return invoice;
  } catch (error) {
    // Roll back only the invoice part and continue outer transaction
    try { await client.query('ROLLBACK TO SAVEPOINT invoice_create_sp'); } catch (_) {}
    logger.error('Error creating invoice from order', { error: error.message, orderId: order.id });
    // Don't throw - invoice creation is non-critical
    return null;
  }
}

// Helper function to handle order delivery and update restaurant inventory
async function handleOrderDelivery(orderId, userData, res) {
  try {
    const result = await withTransaction(async (client) => {
      // Get order first
      const { rows: orders } = await client.query(`
        SELECT * FROM customer_order WHERE id = $1
      `, [orderId]);
      
      if (orders.length === 0) {
        throw new NotFoundError('Order not found');
      }
      
      const order = orders[0];
      
      // Get supplier ID
      const { rows: suppliers } = await client.query(
        'SELECT id FROM supplier WHERE contact_email = $1',
        [userData.email]
      );
      
      if (suppliers.length === 0) {
        throw new ValidationError('Supplier not found');
      }
      
      const supplierId = suppliers[0].id;
      
      // Get order items (orders are now single-supplier, so all items belong to this supplier)
      const { rows: orderItems } = await client.query(`
        SELECT oi.*, p.supplier_id, p.name as product_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        WHERE oi.order_id = $1
      `, [orderId]);
      
      if (orderItems.length === 0) {
        throw new ValidationError('No items found in this order');
      }
      
      // Verify all items belong to this supplier (safety check for data integrity)
      for (const item of orderItems) {
        if (item.supplier_id !== supplierId) {
          throw new ValidationError('Order contains items from other suppliers');
        }
      }
      
      const supplierItems = orderItems;
      
      // Update restaurant inventory ONLY for this supplier's items
      for (const item of supplierItems) {
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
      
      // Create invoice from the order (orders are now single-supplier)
      const invoice = await createInvoiceFromOrder(order, supplierItems, supplierId, client);
      
      // Mark order as COMPLETED (orders are now single-supplier, so completing supplier completes the order)
      await client.query(`
        UPDATE customer_order 
        SET status = 'COMPLETED', updated_at = now()
        WHERE id = $1
      `, [orderId]);
      order.status = 'COMPLETED';
      
      logger.info('Order delivered and restaurant inventory updated', { 
        orderId: order.id,
        restaurantId: order.restaurant_id,
        supplierId,
        itemCount: supplierItems.length,
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
      
      logger.info('Notification sent successfully');
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
    logger.error('Handle order delivery error:', { message: error.message, stack: error.stack });
    // Return meaningful status codes for known errors
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: res.locals.requestId,
      });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: res.locals.requestId,
      });
    }
    return res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to deliver order' },
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
    
    // Group items by supplier - split into separate orders per supplier
    const orderStatus = orderData.status || 'PLACED';
    
    // First, validate all products and group by supplier
    const supplierGroups = new Map();
    
    for (const item of orderData.items) {
      // Get product and supplier info
      const { rows: products } = await query(`
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
      
      // Group by supplier
      if (!supplierGroups.has(product.supplier_id)) {
        supplierGroups.set(product.supplier_id, []);
      }
      supplierGroups.get(product.supplier_id).push({
        ...item,
        product,
        unitPrice: Number(product.current_price),
      });
    }
    
    // Check plan limits before creating orders
    if (orderStatus === 'PLACED') {
      const ordersToCreate = supplierGroups.size;
      const limitCheck = await checkLimit(restaurantId, 'RESTAURANT', 'orders_per_day');
      const newTotal = limitCheck.current + ordersToCreate;
      
      if (!limitCheck.isUnlimited && limitCheck.limit !== null && newTotal > limitCheck.limit) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'LIMIT_EXCEEDED',
            message: `Creating ${ordersToCreate} order(s) would exceed your daily limit (${limitCheck.limit})`,
            details: {
              current: limitCheck.current,
              limit: limitCheck.limit,
              requested: ordersToCreate,
              meterType: 'orders_per_day'
            }
          },
          requestId: req.requestId,
        });
      }
    }
    
    // Create separate order for each supplier
    const createdOrders = [];
    
    const result = await withTransaction(async (client) => {
      for (const [supplierId, items] of supplierGroups.entries()) {
        // Create order for this supplier
        const { rows: [order] } = await client.query(`
          INSERT INTO customer_order (restaurant_id, currency, status)
          VALUES ($1, 'USD', $2)
          RETURNING *
        `, [restaurantId, orderStatus]);
        
        let totalAmount = 0;
        const orderItems = [];
        
        // Process items for this supplier
        for (const item of items) {
          // Check inventory
          const { rows: inventory } = await client.query(
            'SELECT available_qty FROM inventory WHERE product_id = $1 FOR UPDATE',
            [item.productId]
          );
          
          if (inventory.length === 0 || Number(inventory[0].available_qty) < item.quantity) {
            throw new ValidationError(`Insufficient inventory for product ${item.product.sku}`);
          }
          
          // Calculate line total
          const lineTotal = item.unitPrice * item.quantity;
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
            item.unitPrice,
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
        
        // Update order total and placed_at (only if status is PLACED)
        if (orderStatus === 'PLACED') {
          await client.query(`
            UPDATE customer_order 
            SET total_amount = $1, placed_at = now()
            WHERE id = $2
          `, [totalAmount, order.id]);
        } else {
          // For DRAFT orders, just update total_amount
          await client.query(`
            UPDATE customer_order 
            SET total_amount = $1
            WHERE id = $2
          `, [totalAmount, order.id]);
        }
        
        createdOrders.push({ ...order, total_amount: totalAmount, items: orderItems });
      }
      
      return createdOrders;
    });
    
    // If only one order was created, return it directly. Otherwise, return array of orders
    const singleOrder = result.length === 1 ? result[0] : null;
    
    // Log and send notifications for each created order
    for (const order of result) {
      logger.info('Order created', { 
        orderId: order.id, 
        restaurantId: order.restaurant_id,
        supplierId: order.items[0]?.supplier_id,
        totalAmount: order.total_amount,
        itemCount: order.items.length,
        actor: req.userData.id 
      });
      
      // Send notification to supplier about new order (only if PLACED, not DRAFT)
      if (order.status === 'PLACED' && order.items.length > 0) {
        try {
          const supplierId = order.items[0].supplier_id;
          await notifyOrderStatusChange({
            id: order.id,
            total_amount: order.total_amount,
            restaurant_id: order.restaurant_id,
            supplier_id: supplierId,
          }, 'PLACED');
        } catch (notifError) {
          // Don't fail order creation if notification fails
          logger.error('Failed to send order notification', { error: notifError.message });
        }
      }
    }

    // Track usage for each order created (only if PLACED, not DRAFT)
    if (orderStatus === 'PLACED') {
      try {
        await incrementUsage(restaurantId, 'RESTAURANT', 'orders_per_day', result.length);
      } catch (usageError) {
        logger.error('Failed to track order usage', { error: usageError.message });
      }
    }
    
    // Return single order if only one, otherwise return array
    res.status(201).json({
      ok: true,
      data: singleOrder ? { order: singleOrder } : { orders: result },
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
       // Suppliers can acknowledge, process, ship, and complete orders
       if (updateData.status && !['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'COMPLETED'].includes(updateData.status)) {
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

// Send reminder to supplier (restaurant only)
router.post('/:id/remind', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order
    const { rows: orders } = await query(`
      SELECT o.*, r.name as restaurant_name
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      WHERE o.id = $1
    `, [id]);
    
    if (orders.length === 0) {
      throw new NotFoundError('Order not found');
    }
    
    const order = orders[0];
    
    // Verify restaurant ownership (unless admin)
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
    }
    
    // Allow reminders for orders that are not completed/cancelled
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: `Cannot send reminder for ${order.status} orders`,
        },
        requestId: req.requestId,
      });
    }
    
    // Get supplier ID from order items
    const { rows: firstItem } = await query(`
      SELECT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1
    `, [id]);
    
    if (firstItem.length === 0) {
      throw new NotFoundError('Order items not found');
    }
    
    const supplierId = firstItem[0].supplier_id;
    
    // Get supplier information
    const { rows: suppliers } = await query(`
      SELECT s.id, s.name, s.contact_email, u.id as user_id
      FROM supplier s
      LEFT JOIN app_user u ON u.email = s.contact_email
      WHERE s.id = $1
    `, [supplierId]);
    
    if (suppliers.length === 0) {
      throw new NotFoundError('Supplier not found');
    }
    
    const supplier = suppliers[0];
    
    if (!supplier.user_id) {
      logger.warn('No user_id found for supplier', { supplier_id: supplierId });
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Supplier user account not found',
        },
        requestId: req.requestId,
      });
    }
    
    // Import notification service
    const { sendNotification } = await import('../services/notification.service.js');
    
    // Send reminder notification
    const reminderMessage = (order.reminder_count || 0) > 0
      ? `Friendly reminder: Order #${order.id.slice(0, 8)} from ${order.restaurant_name} is still awaiting acknowledgment. Order total: $${order.total_amount || 0}`
      : `Reminder: You have an unacknowledged order #${order.id.slice(0, 8)} from ${order.restaurant_name} for $${order.total_amount || 0}. Please acknowledge when ready.`;
    
    try {
      await sendNotification({
        userId: supplier.user_id,
        userType: 'SUPPLIER',
        notificationType: 'ORDER',
        notificationCategory: 'PLACED',
        title: 'Order Reminder',
        message: reminderMessage,
        referenceId: order.id,
        referenceType: 'ORDER',
        metadata: { 
          order_id: order.id, 
          status: order.status,
          reminder_count: (order.reminder_count || 0) + 1,
          restaurant_name: order.restaurant_name,
        },
      });
    } catch (notifError) {
      logger.warn('Order reminder notification failed; proceeding anyway', { error: notifError.message });
    }
    
    // Update order with reminder tracking
    const { rows: updatedOrders } = await query(`
      UPDATE customer_order
      SET last_reminder_sent_at = now(),
          reminder_count = COALESCE(reminder_count, 0) + 1,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    logger.info('Order reminder sent', {
      orderId: order.id,
      supplierId,
      reminderCount: updatedOrders[0].reminder_count,
    });
    
    res.json({
      ok: true,
      data: {
        order: updatedOrders[0],
        message: 'Reminder sent successfully',
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Send reminder error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to send reminder',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get packing slip (PDF)
router.get('/:id/packing-slip', requireAuth, requireRole(['SUPPLIER', 'RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order with items
    const { rows: orders } = await query(`
      SELECT o.*, r.name as restaurant_name, r.contact_email, r.phone,
        r.address_json as restaurant_address
      FROM customer_order o
      JOIN restaurant r ON r.id = o.restaurant_id
      WHERE o.id = $1
    `, [id]);
    
    if (orders.length === 0) {
      throw new NotFoundError('Order not found');
    }
    
    const order = orders[0];
    
    // If supplier, verify they own items in this order and filter items
    let supplierId = null;
    if (req.userData.role === 'SUPPLIER') {
      const { rows: suppliers } = await query(
        'SELECT id FROM supplier WHERE contact_email = $1',
        [req.userData.email]
      );
      
      if (suppliers.length > 0) {
        supplierId = suppliers[0].id;
      }
    }
    
    // Get order items (filter by supplier if supplier role)
    const itemsQuery = supplierId
      ? `
        SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit,
          s.name as supplier_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        JOIN supplier s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1 AND oi.supplier_id = $2
        ORDER BY p.name
      `
      : `
        SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit,
          s.name as supplier_name
        FROM order_item oi
        JOIN product p ON p.id = oi.product_id
        JOIN supplier s ON s.id = oi.supplier_id
        WHERE oi.order_id = $1
        ORDER BY s.name, p.name
      `;
    
    const { rows: items } = await query(itemsQuery, supplierId ? [id, supplierId] : [id]);
    
    // Return JSON for now (PDF generation can be added later)
    res.json({
      ok: true,
      data: {
        order,
        items,
        packingSlip: {
          orderNumber: order.id.substring(0, 8).toUpperCase(),
          restaurantName: order.restaurant_name,
          restaurantAddress: order.restaurant_address,
          orderDate: order.placed_at || order.created_at,
          items: items.map(item => ({
            sku: item.product_sku,
            name: item.product_name,
            quantity: item.quantity,
            unit: item.unit,
          })),
          totalAmount: order.total_amount,
          currency: order.currency,
        }
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get packing slip error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get packing slip',
      },
      requestId: req.requestId,
    });
  }
});

export { router as ordersRoutes };
