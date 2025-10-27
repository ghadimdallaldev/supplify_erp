import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../middlewares/errorHandler.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const supplierCreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  vatNo: z.string().max(50).optional(),
  contactEmail: z.string().email(),
  phone: z.string().max(20).optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});

const supplierUpdateSchema = supplierCreateSchema.partial();

const supplierListSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  limit: z.string().transform(val => parseInt(val, 10)).default('20'),
  offset: z.string().transform(val => parseInt(val, 10)).default('0'),
});

// List suppliers - publicly available with filters for restaurants
router.get('/', async (req, res) => {
  try {
    const params = supplierListSchema.parse(req.query);
    
    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;
    
    // Text search
    if (params.q) {
      whereConditions.push(`LOWER(s.name) LIKE $${paramIndex}`);
      queryParams.push(`%${params.q.toLowerCase()}%`);
      paramIndex++;
    }
    
    // City filter
    if (params.city) {
      whereConditions.push(`s.address_json->>'city' = $${paramIndex}`);
      queryParams.push(params.city);
      paramIndex++;
    }
    
    // Handle restaurant-specific filtering
    let restaurantId = null;
    
    if (req.userData?.role === 'RESTAURANT' && req.userData.id) {
      restaurantId = req.userData.id;
      
      // Exclude blocklisted suppliers
      whereConditions.push(`
        NOT EXISTS (
          SELECT 1 FROM supplier_blocklist sb
          WHERE sb.supplier_id = s.id AND sb.restaurant_id = $${paramIndex}
        )
      `);
      queryParams.push(restaurantId);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    // Build the SELECT with proper type handling
    let sql = `
      SELECT 
        s.*,
        COALESCE(
          (SELECT COUNT(DISTINCT p.id) FROM product p WHERE p.supplier_id = s.id), 
          0
        ) as product_count,
        COALESCE(
          (SELECT AVG(pr.amount) FROM product p 
           JOIN price pr ON pr.product_id = p.id 
           WHERE p.supplier_id = s.id 
             AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)), 
          0
        ) as avg_price
    `;
    
    // Add follow status check for restaurants
    if (restaurantId) {
      sql += `,
        EXISTS (
          SELECT 1 FROM supplier_follow sf
          WHERE sf.supplier_id = s.id 
            AND sf.restaurant_id = $${paramIndex}
        ) as is_followed`;
      queryParams.push(restaurantId);
      paramIndex++;
    } else {
      sql += `, false as is_followed`;
    }
    
    sql += `
      FROM supplier s
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(params.limit, params.offset);
    
    const { rows } = await query(sql, queryParams);
    
    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM supplier s ${whereClause}`;
    const countParams = queryParams.slice(0, -2);
    const { rows: countRows } = await query(countSql, countParams);
    
    res.json({
      ok: true,
      data: {
        suppliers: rows,
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
      message: 'List suppliers error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list suppliers',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

// Get supplier by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows } = await query('SELECT * FROM supplier WHERE id = $1', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Supplier not found',
        },
        requestId: req.requestId,
      });
    }
    
    const supplier = rows[0];
    
    // Check access permissions
    if (req.userData.role === 'SUPPLIER' && supplier.contact_email !== req.userData.email) {
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
    
    res.json({
      ok: true,
      data: { supplier },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get supplier error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get supplier',
      },
      requestId: req.requestId,
    });
  }
});

// Create supplier (admin only)
router.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const supplierData = supplierCreateSchema.parse(req.body);
    
    const { rows } = await query(`
      INSERT INTO supplier (name, slug, vat_no, contact_email, phone, address_json)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      supplierData.name,
      supplierData.slug,
      supplierData.vatNo,
      supplierData.contactEmail,
      supplierData.phone,
      supplierData.address ? JSON.stringify(supplierData.address) : null,
    ]);
    
    logger.info('Supplier created', { 
      supplierId: rows[0].id, 
      name: rows[0].name,
      actor: req.userData.id 
    });
    
    res.status(201).json({
      ok: true,
      data: { supplier: rows[0] },
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
          message: 'Invalid supplier data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error('Create supplier error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create supplier',
      },
      requestId: req.requestId,
    });
  }
});

// Update supplier
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = supplierUpdateSchema.parse(req.body);
    
    // Check permissions
    const { rows: suppliers } = await query('SELECT * FROM supplier WHERE id = $1', [id]);
    
    if (suppliers.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Supplier not found',
        },
        requestId: req.requestId,
      });
    }
    
    const supplier = suppliers[0];
    
    if (req.userData.role === 'SUPPLIER' && supplier.contact_email !== req.userData.email) {
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
    
    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    
    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField = key === 'vatNo' ? 'vat_no' :
                        key === 'contactEmail' ? 'contact_email' :
                        key === 'address' ? 'address_json' : key;
        
        updateFields.push(`${dbField} = $${paramIndex}`);
        updateValues.push(dbField === 'address_json' ? JSON.stringify(value) : value);
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
      UPDATE supplier 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, updateValues);
    
    logger.info('Supplier updated', { 
      supplierId: rows[0].id, 
      actor: req.userData.id 
    });
    
    res.json({
      ok: true,
      data: { supplier: rows[0] },
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
    
    logger.error('Update supplier error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update supplier',
      },
      requestId: req.requestId,
    });
  }
});

// Follow/Unfollow supplier (restaurant only)
router.post('/:id/follow', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.userData.id;
    
    // Check if already followed
    const { rows: existing } = await query(
      'SELECT * FROM supplier_follow WHERE supplier_id = $1 AND restaurant_id = $2',
      [id, restaurantId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Supplier is already being followed',
        },
        requestId: req.requestId,
      });
    }
    
    await query(
      'INSERT INTO supplier_follow (supplier_id, restaurant_id) VALUES ($1, $2)',
      [id, restaurantId]
    );
    
    logger.info('Supplier followed', { supplierId: id, restaurantId });
    
    res.json({
      ok: true,
      data: { message: 'Supplier followed successfully' },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Follow supplier error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to follow supplier',
      },
      requestId: req.requestId,
    });
  }
});

router.delete('/:id/follow', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.userData.id;
    
    await query(
      'DELETE FROM supplier_follow WHERE supplier_id = $1 AND restaurant_id = $2',
      [id, restaurantId]
    );
    
    logger.info('Supplier unfollowed', { supplierId: id, restaurantId });
    
    res.json({
      ok: true,
      data: { message: 'Supplier unfollowed successfully' },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Unfollow supplier error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to unfollow supplier',
      },
      requestId: req.requestId,
    });
  }
});

// Block/Unblock supplier (restaurant only)
router.post('/:id/block', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.userData.id;
    const { reason } = req.body;
    
    // Check if already blocked
    const { rows: existing } = await query(
      'SELECT * FROM supplier_blocklist WHERE supplier_id = $1 AND restaurant_id = $2',
      [id, restaurantId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Supplier is already blocked',
        },
        requestId: req.requestId,
      });
    }
    
    await query(
      'INSERT INTO supplier_blocklist (supplier_id, restaurant_id, reason) VALUES ($1, $2, $3)',
      [id, restaurantId, reason || null]
    );
    
    logger.info('Supplier blocked', { supplierId: id, restaurantId, reason });
    
    res.json({
      ok: true,
      data: { message: 'Supplier blocked successfully' },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Block supplier error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to block supplier',
      },
      requestId: req.requestId,
    });
  }
});

router.delete('/:id/block', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.userData.id;
    
    await query(
      'DELETE FROM supplier_blocklist WHERE supplier_id = $1 AND restaurant_id = $2',
      [id, restaurantId]
    );
    
    logger.info('Supplier unblocked', { supplierId: id, restaurantId });
    
    res.json({
      ok: true,
      data: { message: 'Supplier unblocked successfully' },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Unblock supplier error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to unblock supplier',
      },
      requestId: req.requestId,
    });
  }
});

export { router as suppliersRoutes };
