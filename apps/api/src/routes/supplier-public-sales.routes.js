import express from 'express'
import { z } from 'zod'
import { requireAuth, requirePermission, requireRole, resolveTenantContext } from '../lib/rbac.js'
import { requireSupplierId } from '../lib/tenant-resolve.js'
import {
  getSupplierPublicSalesConfig,
  listSupplierPublicSalesWarehouses,
  updateSupplierPublicSalesConfig,
} from '../services/public-sales.service.js'

export const supplierPublicSalesRoutes = express.Router()

supplierPublicSalesRoutes.use(requireAuth, resolveTenantContext, requireRole(['SUPPLIER', 'ADMIN']))

const updateSchema = z.object({
  enabled: z.boolean(),
  deliveryWarehouseIds: z.array(z.string().uuid()).max(100).default([]),
  pickupWarehouseId: z.string().uuid().nullable().optional(),
  paymentMethods: z
    .array(z.enum(['CASH_ON_DELIVERY', 'CASH_ON_PICKUP', 'BANK_TRANSFER']))
    .max(3)
    .default([]),
  bankTransferInstructions: z.string().max(2000).nullable().optional(),
})

function routeError(res, req, error) {
  const status = error.name === 'ZodError' || error.name === 'ValidationError' ? 400 : 500
  res.status(status).json({
    ok: false,
    data: null,
    error: { name: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: error.message },
    requestId: req.requestId,
  })
}

supplierPublicSalesRoutes.get(
  '/public-sales',
  requirePermission('SETTINGS_VIEW'),
  async (req, res) => {
    try {
      const supplierId = await requireSupplierId(req)
      const [config, warehouses] = await Promise.all([
        getSupplierPublicSalesConfig(supplierId),
        listSupplierPublicSalesWarehouses(supplierId),
      ])
      res.json({ ok: true, data: { config, warehouses }, error: null, requestId: req.requestId })
    } catch (error) {
      routeError(res, req, error)
    }
  }
)

supplierPublicSalesRoutes.patch(
  '/public-sales',
  requirePermission('SETTINGS_EDIT'),
  async (req, res) => {
    try {
      const supplierId = await requireSupplierId(req)
      const input = updateSchema.parse(req.body)
      const config = await updateSupplierPublicSalesConfig(supplierId, input)
      const warehouses = await listSupplierPublicSalesWarehouses(supplierId)
      res.json({ ok: true, data: { config, warehouses }, error: null, requestId: req.requestId })
    } catch (error) {
      routeError(res, req, error)
    }
  }
)
