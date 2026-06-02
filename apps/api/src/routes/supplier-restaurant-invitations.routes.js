import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { getSupplierIdForRequest } from '../lib/rbac.js'
import { logger } from '../lib/logger.js'
import { isSupplifyV2 } from '../config/supplifyModel.js'
import {
  createSupplierRestaurantInvitation,
  listSupplierRestaurantInvitations,
  revokeSupplierRestaurantInvitation,
} from '../lib/supplier-restaurant-invitations.js'

const router = express.Router()

router.use(requireAuth, requireRole(['SUPPLIER']), resolveTenantContext)

const createSchema = z.object({
  invited_email: z.string().email(),
  invited_name: z.string().max(255).optional(),
  restaurant_name: z.string().max(255).optional(),
})

router.get('/', requirePermission('STAFF_VIEW'), async (req, res) => {
  try {
    if (!isSupplifyV2()) {
      return res.json({
        ok: true,
        data: { invitations: [], v2Required: true },
        error: null,
        requestId: req.requestId,
      })
    }
    const supplierId = await getSupplierIdForRequest(req)
    const invitations = await listSupplierRestaurantInvitations(supplierId)
    res.json({
      ok: true,
      data: { invitations },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('List supplier restaurant invitations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list invitations' },
      requestId: req.requestId,
    })
  }
})

router.post('/', requirePermission('STAFF_INVITE'), async (req, res) => {
  try {
    if (!isSupplifyV2()) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'V2_REQUIRED',
          message: 'Restaurant buyer invites require SUPPLIFY_MODEL_VERSION=v2',
        },
        requestId: req.requestId,
      })
    }
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: parsed.error.message },
        requestId: req.requestId,
      })
    }
    const supplierId = await getSupplierIdForRequest(req)
    const result = await createSupplierRestaurantInvitation({
      supplierId,
      invitedBy: req.userData.id,
      invitedEmail: parsed.data.invited_email,
      invitedName: parsed.data.invited_name,
      restaurantName: parsed.data.restaurant_name,
    })
    res.status(201).json({
      ok: true,
      data: result,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Create supplier restaurant invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: error.message || 'Failed to create invitation' },
      requestId: req.requestId,
    })
  }
})

router.post('/:id/revoke', requirePermission('STAFF_MANAGE'), async (req, res) => {
  try {
    const supplierId = await getSupplierIdForRequest(req)
    const revoked = await revokeSupplierRestaurantInvitation({
      invitationId: req.params.id,
      supplierId,
    })
    if (!revoked) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Invitation not found or not revocable' },
        requestId: req.requestId,
      })
    }
    res.json({ ok: true, data: { invitation: revoked }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('Revoke supplier restaurant invitation error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to revoke invitation' },
      requestId: req.requestId,
    })
  }
})

export default router
