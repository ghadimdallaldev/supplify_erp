import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../middlewares/errorHandler.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const inventoryUpdateSchema = z.object({
  availableQty: z.number().min(0),
});

// Get inventory for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const { rows } = await query(`
      SELECT i.*, p.name as product_name, p.sku, s.name as supplier_name
      FROM inventory i
      JOIN product p ON p.id = i.product_id
      JOIN supplier s ON s.id = p.supplier_id
      WHERE i.product_id = $1
    `, [productId]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Inventory not found for this product',
        },
        requestId: req.requestId,
      });
    }
    
    res.json({
      ok: true,
      data: { inventory: rows[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get inventory error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get inventory',
      },
      requestId: req.requestId,
    });
  }
});

// Update inventory (supplier or admin only)
router.patch('/product/:productId', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const { productId } = req.params;
    const updateData = inventoryUpdateSchema.parse(req.body);
    
    // Verify product ownership for suppliers
    if (req.userData.role === 'SUPPLIER') {
      const { rows: products } = await query(`
        SELECT p.*, s.contact_email 
        FROM product p 
        JOIN supplier s ON s.id = p.supplier_id 
        WHERE p.id = $1
      `, [productId]);
      
      if (products.length === 0) {
        throw new ValidationError('Product not found');
      }
      
      if (products[0].contact_email !== req.userData.email) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied. You can only update inventory for your own products',
          },
          requestId: req.requestId,
        });
      }
    }
    
    // Update or insert inventory
    const { rows } = await query(`
      INSERT INTO inventory (product_id, available_qty, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (product_id) 
      DO UPDATE SET 
        available_qty = EXCLUDED.available_qty,
        updated_at = now()
      RETURNING *
    `, [productId, updateData.availableQty]);
    
    logger.info('Inventory updated', { 
      productId, 
      availableQty: updateData.availableQty,
      actor: req.userData.id 
    });
    
    res.json({
      ok: true,
      data: { inventory: rows[0] },
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
          message: 'Invalid inventory data',
          details: error.errors,
        },
        requestId: req.requestId,
      });
    }
    
    logger.error('Update inventory error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update inventory',
      },
      requestId: req.requestId,
    });
  }
});

export { router as inventoryRoutes };
