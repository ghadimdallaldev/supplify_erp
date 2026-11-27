/**
 * `/api/products/category-requests`: a supplier asks Supplify for a missing platform category.
 * Mounted inside the products router (auth, tenant context, CATALOG_* permissions apply).
 */
import express from 'express'
import { z } from 'zod'
import { getSupplierIdForRequest, requireRole } from '../../lib/rbac.js'
import { catalogValidation, sendCatalogError } from '../../lib/catalog-errors.js'
import {
  createCategoryRequest,
  listCategoryRequests,
} from '../../services/category-requests.service.js'

const router = express.Router()

export const CATEGORY_REQUEST_STATUSES = ['pending', 'approved', 'merged', 'rejected']

export const categoryRequestCreateSchema = z.object({
  proposedName: z.string().trim().min(1).max(80),
  proposedNameAr: z.string().trim().max(80).nullable().optional(),
  proposedParentId: z.string().uuid().nullable().optional(),
  productIds: z.array(z.string().uuid()).max(500).default([]),
})
const listSchema = z.object({ status: z.enum(CATEGORY_REQUEST_STATUSES).optional() })

router.use(requireRole(['SUPPLIER', 'ADMIN']))

async function supplierFor(req) {
  const supplierId = await getSupplierIdForRequest(req)
  if (!supplierId) throw catalogValidation('supplierNotFound')
  return supplierId
}

router.get('/', async (req, res) => {
  try {
    const { status } = listSchema.parse(req.query)
    const requests = await listCategoryRequests({ supplierId: await supplierFor(req), status })
    return res.json({ ok: true, data: { requests }, error: null, requestId: req.requestId })
  } catch (error) {
    return sendCatalogError(req, res, error, 'List category requests failed')
  }
})

router.post('/', async (req, res) => {
  try {
    const body = categoryRequestCreateSchema.parse(req.body)
    const data = await createCategoryRequest(await supplierFor(req), body)
    return res
      .status(data.alreadyRequested ? 200 : 201)
      .json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    return sendCatalogError(req, res, error, 'Create category request failed')
  }
})

export { router as categoryRequestsRouter }
