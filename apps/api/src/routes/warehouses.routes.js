import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const router = express.Router();

// Get all warehouses for current supplier
router.get('/', requireAuth, requireRole(['SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    let warehousesQuery = `
      SELECT 
        w.*,
        s.name as supplier_name,
        COUNT(DISTINCT i.product_id) as product_count,
        COALESCE(SUM(i.available_qty), 0) as total_available_qty,
        COALESCE(SUM(i.reserved_qty), 0) as total_reserved_qty
      FROM warehouse w
      JOIN supplier s ON s.id = w.supplier_id
      LEFT JOIN inventory i ON i.warehouse_id = w.id
      WHERE w.is_active = true
    `;
    
    const queryParams = [];
    
    // For suppliers, only show their own warehouses
    if (req.userData.role === 'SUPPLIER') {
      warehousesQuery += ` AND s.contact_email = $1`;
      queryParams.push(req.userData.email);
    }
    
    warehousesQuery += ` GROUP BY w.id, s.name ORDER BY w.name`;
    
    logger.info('Executing warehouses query', { queryParams });
    const { rows } = await query(warehousesQuery, queryParams);
    
    // Get inventory details for each warehouse
    const warehousesWithInventory = await Promise.all(rows.map(async (warehouse) => {
      const inventoryQuery = `
        SELECT 
          i.product_id as id,
          i.product_id,
          i.warehouse_id,
          i.available_qty,
          i.reserved_qty,
          i.updated_at,
          p.name as product_name,
          p.sku,
          0 as low_stock_threshold
        FROM inventory i
        JOIN product p ON p.id = i.product_id
        WHERE i.warehouse_id = $1
      `;
      
      const { rows: inventory } = await query(inventoryQuery, [warehouse.id]);
      
      return {
        ...warehouse,
        inventory: inventory.map(item => ({
          ...item,
          isLowStock: false,
        })),
      };
    }));
    
    res.json({
      ok: true,
      data: { warehouses: warehousesWithInventory },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error({ 
      message: 'Get warehouses error',
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get warehouses',
        details: error.message,
      },
      requestId: req.requestId,
    });
  }
});

export { router as warehousesRoutes };

