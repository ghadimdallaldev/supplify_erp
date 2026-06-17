import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getSupplierIdForRequest,
  requirePermission,
  requireAnyPermission,
  getRequestTenant,
} from '../lib/rbac.js'
import {
  assertDriverAssignmentAccess,
  assertDriverStatusUpdate,
  isDriverOnlyPermissions,
  requireLinkedDriver,
} from '../lib/driver-rbac.js'
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
import {
  recordDriverLocation,
  getOrderTracking,
  isGpsTrackingEnabled,
} from '../services/driver-location.service.js'
import { ValidationError, ForbiddenError, NotFoundError } from '../middlewares/errorHandler.js'
import { hasPermission } from '../lib/permissions.js'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'
import { meterStorageFromRequest } from '../lib/storage-upload.js'
import {
  sanitizeUploadFileName,
  assertFileExtensionMatchesMime,
  MAX_UPLOAD_BYTES,
} from '../lib/sanitize-upload.js'
import { createPresignedUpload } from '../services/storage/storage.service.js'

const router = express.Router({ mergeParams: true })

router.use(requireAuth, resolveTenantContext)

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
  status: z.enum([
    'assigned',
    'picked_up',
    'out_for_delivery',
    'delivered',
    'failed',
    'rescheduled',
  ]),
  notes: z.string().optional().nullable(),
  failure_reason: z.string().optional().nullable(),
})
const reassignSchema = z.object({
  driver_id: z.string().uuid(),
  reason: z.string().optional().nullable(),
})
const podSchema = z.object({
  file_key: z.string().optional().nullable(),
  signature_file_key: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  recipient_name: z.string().optional().nullable(),
  driver_assignment_id: z.string().uuid().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
})

const podPresignSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().optional().nullable(),
})

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracyMeters: z.number().optional().nullable(),
  speedMps: z.number().optional().nullable(),
  headingDegrees: z.number().optional().nullable(),
  recordedAt: z.string().datetime().optional().nullable(),
  route_id: z.string().uuid().optional().nullable(),
  route_stop_id: z.string().uuid().optional().nullable(),
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
  requireAnyPermission('FULFILLMENT_MANAGE', 'DRIVER_DELIVERIES_MANAGE'),
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
      const perms = req.tenantContext?.permissions ?? []
      assertDriverStatusUpdate(body.status, perms)
      if (isDriverOnlyPermissions(perms)) {
        await assertDriverAssignmentAccess({
          userId: req.userData.id,
          supplierId,
          orderId: req.params.id,
          permissions: perms,
        })
      }
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
  '/:id/proof-of-delivery/presign',
  ...supplierFulfillmentGate,
  requireAnyPermission('FULFILLMENT_MANAGE', 'DRIVER_DELIVERIES_MANAGE'),
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
      const perms = req.tenantContext?.permissions ?? []
      if (isDriverOnlyPermissions(perms)) {
        await assertDriverAssignmentAccess({
          userId: req.userData.id,
          supplierId,
          orderId: req.params.id,
          permissions: perms,
        })
      }
      const body = podPresignSchema.parse(req.body)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(body.fileType)) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'File type not allowed' },
          requestId: req.requestId,
        })
      }
      const sizeBytes = body.fileSize ? Number(body.fileSize) : 0
      if (sizeBytes > MAX_UPLOAD_BYTES) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'File size too large (max 10MB)' },
          requestId: req.requestId,
        })
      }
      let safeFileName
      try {
        safeFileName = sanitizeUploadFileName(body.fileName)
        assertFileExtensionMatchesMime(safeFileName, body.fileType)
      } catch (err) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: err?.message || 'Invalid file name' },
          requestId: req.requestId,
        })
      }
      const storageMeter = await meterStorageFromRequest(req, sizeBytes)
      if (!storageMeter.ok) {
        return res.status(storageMeter.status).json({
          ok: false,
          data: null,
          error: storageMeter.error,
          requestId: req.requestId,
        })
      }
      const fileKey = `uploads/${req.userData.id}/pod/${req.params.id}/${Date.now()}-${safeFileName}`
      const { presignedUrl, publicUrl, bucket } = await createPresignedUpload({
        fileKey,
        fileSize: sizeBytes > 0 ? sizeBytes : MAX_UPLOAD_BYTES,
        fileType: body.fileType,
        userId: req.userData.id,
      })
      res.json({
        ok: true,
        data: {
          presignedUrl,
          url: presignedUrl,
          publicUrl,
          fileKey,
          fileName: body.fileName,
          fileType: body.fileType,
          bucket,
          storageMetered: sizeBytes > 0,
        },
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
      logger.error('POD presign error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to generate upload URL' },
        requestId: req.requestId,
      })
    }
  }
)

router.post(
  '/:id/proof-of-delivery',
  ...supplierFulfillmentGate,
  requireAnyPermission('FULFILLMENT_MANAGE', 'DRIVER_DELIVERIES_MANAGE'),
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
      const perms = req.tenantContext?.permissions ?? []
      if (isDriverOnlyPermissions(perms)) {
        await assertDriverAssignmentAccess({
          userId: req.userData.id,
          supplierId,
          orderId: req.params.id,
          permissions: perms,
        })
      }
      const body = podSchema.parse(req.body)
      const proof = await submitProofOfDelivery({
        orderId: req.params.id,
        supplierId,
        fileKey: body.file_key,
        signatureFileKey: body.signature_file_key,
        notes: body.notes,
        recipientName: body.recipient_name,
        driverAssignmentId: body.driver_assignment_id,
        userId: req.userData?.id,
        latitude: body.latitude,
        longitude: body.longitude,
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

router.get('/:id/proof-of-delivery', requireAuth, resolveTenantContext, async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    let proof = null
    if (tenant?.tenantType === 'SUPPLIER') {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const perms = req.tenantContext?.permissions ?? []
      const canView =
        hasPermission(perms, P.FULFILLMENT_VIEW) || hasPermission(perms, P.DRIVER_DELIVERIES_VIEW)
      if (!canView) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Permission denied' },
          requestId: req.requestId,
        })
      }
      if (isDriverOnlyPermissions(perms)) {
        await assertDriverAssignmentAccess({
          userId: req.userData.id,
          supplierId,
          orderId: req.params.id,
          permissions: perms,
        })
      }
      proof = await getProofOfDelivery(req.params.id, supplierId)
    } else if (tenant?.tenantType === 'RESTAURANT') {
      proof = await getProofOfDelivery(req.params.id, null, tenant.tenantId)
    } else {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Access denied' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: { proof },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Get POD error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get proof of delivery' },
      requestId: req.requestId,
    })
  }
})

router.post(
  '/:id/location',
  ...supplierFulfillmentGate,
  requireAnyPermission('FULFILLMENT_MANAGE', 'DRIVER_DELIVERIES_MANAGE'),
  async (req, res) => {
    try {
      if (!isGpsTrackingEnabled()) {
        return res.json({
          ok: true,
          data: { trackingEnabled: false, stored: false, reason: 'gps_disabled' },
          error: null,
          requestId: req.requestId,
        })
      }
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const body = locationSchema.parse(req.body)
      const perms = req.tenantContext?.permissions ?? []
      let driverId = null
      if (isDriverOnlyPermissions(perms)) {
        driverId = await requireLinkedDriver(req.userData.id, supplierId)
        await assertDriverAssignmentAccess({
          userId: req.userData.id,
          supplierId,
          orderId: req.params.id,
          permissions: perms,
        })
      } else if (hasPermission(perms, P.FULFILLMENT_MANAGE)) {
        const { getActiveDriverAssignment } = await import(
          '../services/driver-fulfillment.service.js'
        )
        const assignment = await getActiveDriverAssignment(req.params.id)
        driverId = assignment?.driver_id
        if (!driverId) {
          throw new ValidationError('No driver assigned to this order')
        }
      } else {
        throw new ForbiddenError('Not allowed to update location')
      }

      const result = await recordDriverLocation({
        supplierId,
        orderId: req.params.id,
        driverId,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracyMeters: body.accuracyMeters,
        speedMps: body.speedMps,
        headingDegrees: body.headingDegrees,
        recordedAt: body.recordedAt,
        routeId: body.route_id,
        routeStopId: body.route_stop_id,
      })
      res.json({
        ok: true,
        data: result,
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
      if (error instanceof ForbiddenError) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: error.message },
          requestId: req.requestId,
        })
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      logger.error('Record driver location error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to record location' },
        requestId: req.requestId,
      })
    }
  }
)

router.get('/:id/tracking', requireAuth, resolveTenantContext, async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
    const orderId = req.params.id
    let tracking = null

    if (tenant?.tenantType === 'RESTAURANT') {
      tracking = await getOrderTracking({
        orderId,
        restaurantId: tenant.tenantId,
      })
    } else if (tenant?.tenantType === 'SUPPLIER' || req.userData?.role === 'ADMIN') {
      const supplierId = await resolveSupplierId(req)
      if (!supplierId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      const perms = req.tenantContext?.permissions ?? []
      if (isDriverOnlyPermissions(perms)) {
        await assertDriverAssignmentAccess({
          userId: req.userData.id,
          supplierId,
          orderId,
          permissions: perms,
        })
      } else if (
        !hasPermission(perms, P.FULFILLMENT_VIEW) &&
        !hasPermission(perms, P.DRIVER_DELIVERIES_VIEW) &&
        req.userData?.role !== 'ADMIN'
      ) {
        throw new ForbiddenError('Missing permission to view tracking')
      }
      tracking = await getOrderTracking({
        orderId,
        supplierId,
        exposeDriverPhone: hasPermission(perms, P.FULFILLMENT_MANAGE),
      })
    } else {
      throw new ForbiddenError('Not allowed to view tracking')
    }

    res.json({
      ok: true,
      data: tracking,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: error.message },
        requestId: req.requestId,
      })
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Get order tracking error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load tracking' },
      requestId: req.requestId,
    })
  }
})

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
