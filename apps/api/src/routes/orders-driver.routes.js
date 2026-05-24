import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getSupplierIdForRequest,
  requirePermission,
  getRequestTenant,
} from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { logger } from '../lib/logger.js'
import {
  assignDriverToOrder,
  updateDeliveryStatus,
  reassignDriver,
  submitProofOfDelivery,
  confirmProofOfDelivery,
  getProofOfDelivery,
} from '../services/driver-fulfillment.service.js'
import { ValidationError } from '../middlewares/errorHandler.js'

const router = express.Router({ mergeParams: true })

const fulfillmentFeature = requireFeature(
  'fulfillment',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

// Supplier-only gate is per-route — do not router.use() at mount root or POST /api/orders
// (restaurant checkout) and other tenant routes never reach handlers below.
const supplierFulfillmentGate = [requireRole(['SUPPLIER', 'ADMIN']), fulfillmentFeature]

async function resolveSupplierId(req) {
  return (
    (await getSupplierIdForRequest(req)) ||
    (req.userData.role === 'ADMIN' ? req.query.supplier_id : null)
  )
}

const assignSchema = z.object({ driver_id: z.string().uuid() })
const deliveryStatusSchema = z.object({
  status: z.enum(['picked_up', 'out_for_delivery', 'delivered', 'failed']),
  notes: z.string().optional().nullable(),
  failure_reason: z.string().optional().nullable(),
})
const reassignSchema = z.object({
  driver_id: z.string().uuid(),
  reason: z.string().optional().nullable(),
})
const podSchema = z.object({
  file_key: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  recipient_name: z.string().optional().nullable(),
  driver_assignment_id: z.string().uuid().optional().nullable(),
})

router.post(
  '/:id/assign-driver',
  ...supplierFulfillmentGate,
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const body = assignSchema.parse(req.body)
      const assignment = await assignDriverToOrder({
        supplierId,
        orderId: req.params.id,
        driverId: body.driver_id,
        assignedByUserId: req.userData?.id,
      })
      res.status(201).json({
        ok: true,
        data: { assignment },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof ValidationError || error.name === 'ZodError') {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: error.message || 'Invalid request',
          },
          requestId: req.requestId,
        })
      }
      logger.error('Assign driver error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to assign driver' },
        requestId: req.requestId,
      })
    }
  }
)

router.patch(
  '/:id/delivery-status',
  ...supplierFulfillmentGate,
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const body = deliveryStatusSchema.parse(req.body)
      if (body.status === 'failed' && !body.failure_reason?.trim()) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'failure_reason is required when status is failed',
          },
          requestId: req.requestId,
        })
      }
      const assignment = await updateDeliveryStatus({
        supplierId,
        orderId: req.params.id,
        status: body.status,
        notes: body.notes,
        failureReason: body.failure_reason,
        userId: req.userData?.id,
      })
      res.json({
        ok: true,
        data: { assignment },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof ValidationError || error.name === 'ZodError') {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: error.message || 'Invalid request',
          },
          requestId: req.requestId,
        })
      }
      logger.error('Update delivery status error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update delivery status' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/:id/reassign-driver',
  ...supplierFulfillmentGate,
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const body = reassignSchema.parse(req.body)
      const assignment = await reassignDriver({
        supplierId,
        orderId: req.params.id,
        driverId: body.driver_id,
        reason: body.reason,
        assignedByUserId: req.userData?.id,
      })
      res.json({
        ok: true,
        data: { assignment },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof ValidationError || error.name === 'ZodError') {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: error.message || 'Invalid request',
          },
          requestId: req.requestId,
        })
      }
      logger.error('Reassign driver error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to reassign driver' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/:id/proof-of-delivery',
  ...supplierFulfillmentGate,
  requirePermission('FULFILLMENT_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const body = podSchema.parse(req.body)
      const proof = await submitProofOfDelivery({
        orderId: req.params.id,
        supplierId,
        fileKey: body.file_key,
        notes: body.notes,
        recipientName: body.recipient_name,
        driverAssignmentId: body.driver_assignment_id,
        userId: req.userData?.id,
      })
      res.status(201).json({
        ok: true,
        data: { proof },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Submit POD error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to submit proof of delivery' },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/:id/proof-of-delivery',
  ...supplierFulfillmentGate,
  requirePermission('FULFILLMENT_VIEW'),
  async (req, res) => {
    try {
      const proof = await getProofOfDelivery(req.params.id)
      res.json({
        ok: true,
        data: { proof },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get POD error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to get proof of delivery' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/:id/proof-of-delivery/confirm',
  requireAuth,
  resolveTenantContext,
  async (req, res) => {
    try {
      const tenant = await getRequestTenant(req)
      if (tenant?.tenantType !== 'RESTAURANT') {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Only restaurants can confirm receipt' },
          requestId: req.requestId,
        })
      }
      const proof = await confirmProofOfDelivery(req.params.id, tenant.tenantId, req.userData?.id)
      res.json({
        ok: true,
        data: { proof },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Confirm POD error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to confirm proof of delivery' },
        requestId: req.requestId,
      })
    }
  }
)

export { router as ordersDriverRoutes }
