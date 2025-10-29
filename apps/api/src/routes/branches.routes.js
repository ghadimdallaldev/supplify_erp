import express from 'express';
const router = express.Router();
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { checkBranchLimit, createAuditLog } from '../lib/plan-enforcement.js';

/**
 * GET /api/branches
 * Get all branches for authenticated restaurant
 */
router.get('/', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0 && req.userData.role !== 'ADMIN') {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Restaurant not found' },
        requestId: req.requestId,
      });
    }

    const restaurantId = req.userData.role === 'ADMIN' 
      ? req.query.restaurant_id 
      : restaurants[0].id;

    if (!restaurantId) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'BAD_REQUEST', message: 'Restaurant ID required' },
        requestId: req.requestId,
      });
    }

    const { rows: branches } = await query(`
      SELECT * FROM branch 
      WHERE tenant_id = $1 
      ORDER BY created_at DESC
    `, [restaurantId]);

    res.json({
      ok: true,
      data: { branches },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get branches error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get branches' },
      requestId: req.requestId,
    });
  }
});

/**
 * POST /api/branches
 * Create a new branch
 */
router.post('/', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Restaurant not found' },
        requestId: req.requestId,
      });
    }

    const restaurantId = restaurants[0].id;

    // Check plan limits
    const limitCheck = await checkBranchLimit(restaurantId);
    
    if (!limitCheck.allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'BRANCH_LIMIT_REACHED',
          message: limitCheck.reason,
          details: {
            currentPlan: limitCheck.currentPlan,
            requiredPlan: limitCheck.requiredPlan,
            limit: limitCheck.limit,
            current: limitCheck.current
          }
        },
        requestId: req.requestId,
      });
    }

    // Create branch
    const { name, code, address, contact_name, contact_email, contact_phone } = req.body;

    const { rows: newBranch } = await query(`
      INSERT INTO branch (tenant_id, name, code, address, contact_name, contact_email, contact_phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [restaurantId, name, code || null, address || null, contact_name || null, contact_email || null, contact_phone || null]);

    // Create audit log
    await createAuditLog('CREATE_BRANCH', {
      entityType: 'BRANCH',
      entityId: newBranch[0].id,
      description: `Created branch: ${name}`,
      changes: { name, code, address }
    });

    res.status(201).json({
      ok: true,
      data: { branch: newBranch[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Create branch error:', error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        ok: false,
        data: null,
        error: { name: 'DUPLICATE', message: 'Branch with this code already exists' },
        requestId: req.requestId,
      });
    }

    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to create branch' },
      requestId: req.requestId,
    });
  }
});

/**
 * PUT /api/branches/:id
 * Update a branch
 */
router.put('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const branchId = req.params.id;
    const { name, address, contact_name, contact_email, contact_phone, is_active } = req.body;

    const { rows: updatedBranch } = await query(`
      UPDATE branch 
      SET name = COALESCE($1, name),
          address = COALESCE($2, address),
          contact_name = COALESCE($3, contact_name),
          contact_email = COALESCE($4, contact_email),
          contact_phone = COALESCE($5, contact_phone),
          is_active = COALESCE($6, is_active),
          updated_at = now()
      WHERE id = $7
      RETURNING *
    `, [name, address, contact_name, contact_email, contact_phone, is_active, branchId]);

    if (updatedBranch.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Branch not found' },
        requestId: req.requestId,
      });
    }

    res.json({
      ok: true,
      data: { branch: updatedBranch[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Update branch error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update branch' },
      requestId: req.requestId,
    });
  }
});

/**
 * DELETE /api/branches/:id
 * Delete a branch
 */
router.delete('/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const branchId = req.params.id;

    const { rows: deletedBranch } = await query(`
      DELETE FROM branch WHERE id = $1 RETURNING *
    `, [branchId]);

    if (deletedBranch.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Branch not found' },
        requestId: req.requestId,
      });
    }

    res.json({
      ok: true,
      data: { branch: deletedBranch[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Delete branch error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to delete branch' },
      requestId: req.requestId,
    });
  }
});

export default router;

