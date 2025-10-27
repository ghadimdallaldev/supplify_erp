import express from 'express';
import { requireAuth, requireRole, requireOwnership } from '../lib/rbac.js';
import { query, withTransaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const productCreateSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  description_ar: z.string().max(1000).optional(),
  brand: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  image_url: z.string().url().optional(),
  unit: z.string().max(20).optional(),
});

const productUpdateSchema = productCreateSchema.partial();

const productListSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  supplier: z.string().uuid().optional(),
  inStock: z.string().transform(val => val === 'true').optional(),
  limit: z.string().transform(val => parseInt(val, 10)).default('20'),
  offset: z.string().transform(val => parseInt(val, 10)).default('0'),
});

// List products with filters
router.get('/', async (req, res) => {
  try {
    const params = productListSchema.parse(req.query);
    
    // Check if user is a restaurant to show custom pricing
    let restaurantId = null;
    try {
      // Only check if there's auth token
      if (req.user && req.user.email) {
        const { rows } = await query('SELECT id FROM restaurant WHERE contact_email = $1', [req.user.email]);
        if (rows.length > 0) {
          restaurantId = rows[0].id;
        }
      }
    } catch (e) {
      // Not authenticated or not a restaurant, continue with standard pricing
      restaurantId = null;
    }
    
    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;
    
    // Text search
    if (params.q) {
      whereConditions.push(`LOWER(p.name) LIKE $${paramIndex}`);
      queryParams.push(`%${params.q.toLowerCase()}%`);
      paramIndex++;
    }
    
    // Category filter
    if (params.category) {
      whereConditions.push(`p.category = $${paramIndex}`);
      queryParams.push(params.category);
      paramIndex++;
    }
    
    // Supplier filter
    if (params.supplier) {
      whereConditions.push(`p.supplier_id = $${paramIndex}`);
      queryParams.push(params.supplier);
      paramIndex++;
    }
    
    // In stock filter
    if (params.inStock) {
      whereConditions.push(`i.available_qty > 0`);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    // Build restaurant pricing join if restaurant is viewing
    let restaurantPricingJoin = '';
    if (restaurantId) {
      // Note: We'll use a separate parameter for restaurant_id in the pricing join
      // This is safe because restaurantId comes from authenticated user lookup
      const pricingParamIndex = queryParams.length + 1;
      queryParams.push(restaurantId);
      restaurantPricingJoin = `
      LEFT JOIN LATERAL (
        SELECT id, price, currency, contract_discount_percentage
        FROM restaurant_pricing
        WHERE restaurant_pricing.product_id = p.id
          AND restaurant_pricing.restaurant_id = $${pricingParamIndex}
          AND restaurant_pricing.is_active = true
          AND (restaurant_pricing.contract_end_date IS NULL OR restaurant_pricing.contract_end_date >= CURRENT_DATE)
          AND (restaurant_pricing.contract_start_date IS NULL OR restaurant_pricing.contract_start_date <= CURRENT_DATE)
        LIMIT 1
      ) rp ON true`;
    } else {
      restaurantPricingJoin = 'LEFT JOIN NULL::restaurant_pricing AS rp ON false';
    }
    
    // Include restaurant-specific pricing if restaurant is viewing
    const sql = `
      SELECT 
        p.*,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.contact_email as supplier_email,
        COALESCE(inv.total_available, 0) as available_qty,
        -- Use restaurant-specific price if available, otherwise standard price
        COALESCE(rp.price, pr.amount) as current_price,
        rp.price as contract_price,
        pr.amount as standard_price,
        COALESCE(rp.currency, pr.currency) as currency,
        rp.contract_discount_percentage,
        CASE WHEN rp.id IS NOT NULL THEN true ELSE false END as has_contract_pricing
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN (
        SELECT product_id, SUM(available_qty) as total_available
        FROM inventory
        GROUP BY product_id
      ) inv ON inv.product_id = p.id
      LEFT JOIN LATERAL (
        SELECT amount, currency
        FROM price
        WHERE price.product_id = p.id
          AND (valid_to IS NULL OR now() BETWEEN valid_from AND valid_to)
        ORDER BY valid_from DESC
        LIMIT 1
      ) pr ON true
      ${restaurantPricingJoin}
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(params.limit, params.offset);
    
    const { rows } = await query(sql, queryParams);
    
    // Get total count for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM product p
      LEFT JOIN inventory i ON i.product_id = p.id
      ${whereClause}
    `;
    
    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const { rows: countRows } = await query(countSql, countParams);
    
    res.json({
      ok: true,
      data: {
        products: rows,
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
      message: 'List products error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list products',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows } = await query(`
      SELECT 
        p.*,
        s.name as supplier_name,
        s.slug as supplier_slug,
        s.contact_email as supplier_email,
        i.available_qty,
        pr.amount as current_price,
        pr.currency
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      LEFT JOIN inventory i ON i.product_id = p.id
      LEFT JOIN price pr ON pr.product_id = p.id 
        AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
      WHERE p.id = $1
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Product not found',
        },
        requestId: req.requestId,
      });
    }
    
    res.json({
      ok: true,
      data: { product: rows[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get product error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get product',
      },
      requestId: req.requestId,
    });
  }
});

// Create product (supplier or admin only)
router.post('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const productData = productCreateSchema.parse(req.body);
    
    // For suppliers, ensure they can only create products for their own supplier record
    let supplierId = req.body.supplier_id;
    
    if (req.userData.role === 'SUPPLIER') {
      // Find supplier by user email
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
      
      supplierId = suppliers[0].id;
    }
    
    if (!supplierId) {
      throw new ValidationError('supplier_id is required');
    }
    
    // Use transaction to create product, price, and inventory together
    await query('BEGIN');
    
    try {
      // Create product
      const { rows } = await query(`
        INSERT INTO product (
          supplier_id, sku, name, name_ar, description, description_ar,
          brand, category, image_url, unit
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        supplierId,
        productData.sku,
        productData.name,
        productData.name_ar,
        productData.description,
        productData.description_ar,
        productData.brand,
        productData.category,
        productData.image_url,
        productData.unit,
      ]);
      
      const product = rows[0];
      
      // Create price if provided
      if (req.body.price !== undefined && req.body.price !== null) {
        await query(`
          INSERT INTO price (product_id, amount, currency, valid_from)
          VALUES ($1, $2, 'USD', now())
        `, [product.id, req.body.price]);
      }
      
      // Create inventory if initial stock provided
      if (req.body.initialStock !== undefined && req.body.initialStock !== null) {
        await query(`
          INSERT INTO inventory (product_id, warehouse_id, available_qty, reserved_qty, on_order_qty)
          VALUES ($1, $2, $3, 0, 0)
        `, [product.id, req.body.warehouse_id || null, req.body.initialStock]);
      }
      
      await query('COMMIT');
      
      logger.info('Product created with price and inventory', { 
        productId: product.id, 
        sku: product.sku,
        actor: req.userData.id 
      });
      
      res.status(201).json({
        ok: true,
        data: { product },
        error: null,
        requestId: req.requestId,
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid product data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error('Create product error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create product',
      },
      requestId: req.requestId,
    });
  }
});

// Update product (supplier owner or admin only)
router.patch('/:id', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = productUpdateSchema.parse(req.body);
    
    // Check if product exists and user has permission
    const { rows: existingProducts } = await query(
      'SELECT p.*, s.contact_email FROM product p JOIN supplier s ON s.id = p.supplier_id WHERE p.id = $1',
      [id]
    );
    
    if (existingProducts.length === 0) {
      throw new NotFoundError('Product not found');
    }
    
    const product = existingProducts[0];
    
    // Check ownership for suppliers
    if (req.userData.role === 'SUPPLIER' && product.contact_email !== req.userData.email) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Access denied. You can only update your own products',
        },
        requestId: req.requestId,
      });
    }
    
    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    
    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(value);
        paramIndex++;
      }
    });
    
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
    updateValues.push(id);
    
    const { rows } = await query(`
      UPDATE product 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, updateValues);
    
    logger.info('Product updated', { 
      productId: rows[0].id, 
      actor: req.userData.id 
    });
    
    res.json({
      ok: true,
      data: { product: rows[0] },
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
    
    logger.error('Update product error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update product',
      },
      requestId: req.requestId,
    });
  }
});

export { router as productsRoutes };
