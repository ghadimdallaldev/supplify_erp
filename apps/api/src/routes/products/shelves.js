/**
 * `/api/products/shelves`: a supplier branch's own storefront groupings. Mounted inside the
 * products router, so auth, tenant context, the product_catalog gate and the CATALOG_*
 * permission split (GET view, writes edit, DELETE manage) already apply.
 */
import express from 'express'
import { z } from 'zod'
import { getSupplierIdForRequest, requireRole } from '../../lib/rbac.js'
import { catalogValidation, sendCatalogError } from '../../lib/catalog-errors.js'
import {
  archiveShelf,
  createShelf,
  listShelves,
  reorderShelves,
  setShelfProducts,
  changeShelfProducts,
  updateShelf,
} from '../../services/shelves.service.js'

const router = express.Router()

const shelfName = z.string().trim().min(1).max(80)
export const shelfCreateSchema = z.object({
  name: shelfName,
  name_ar: z.string().trim().max(80).nullable().optional(),
})
export const shelfUpdateSchema = z
  .object({
    name: shelfName.optional(),
    name_ar: z.string().trim().max(80).nullable().optional(),
    display_order: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
export const shelfProductsSchema = z.object({ productIds: z.array(z.string().uuid()).max(5000) })
export const shelfProductsChangeSchema = z
  .object({
    add: z.array(z.string().uuid()).max(5000).default([]),
    remove: z.array(z.string().uuid()).max(5000).default([]),
  })
  .strict()
export const shelfOrderSchema = z.object({ shelfIds: z.array(z.string().uuid()).min(1).max(500) })
const shelfIdParam = z.string().uuid()

router.use(requireRole(['SUPPLIER', 'ADMIN']))

async function supplierFor(req) {
  const supplierId = await getSupplierIdForRequest(req)
  if (!supplierId) throw catalogValidation('supplierNotFound')
  return supplierId
}

const ok = (req, res, data, status = 200) =>
  res.status(status).json({ ok: true, data, error: null, requestId: req.requestId })

router.get('/', async (req, res) => {
  try {
    return ok(req, res, { shelves: await listShelves(await supplierFor(req)) })
  } catch (error) {
    return sendCatalogError(req, res, error, 'List shelves failed')
  }
})

router.post('/', async (req, res) => {
  try {
    const body = shelfCreateSchema.parse(req.body)
    const shelf = await createShelf(await supplierFor(req), body)
    return ok(req, res, { shelf }, 201)
  } catch (error) {
    return sendCatalogError(req, res, error, 'Create shelf failed')
  }
})

router.put('/order', async (req, res) => {
  try {
    const { shelfIds } = shelfOrderSchema.parse(req.body)
    return ok(req, res, { shelves: await reorderShelves(await supplierFor(req), shelfIds) })
  } catch (error) {
    return sendCatalogError(req, res, error, 'Reorder shelves failed')
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const id = shelfIdParam.parse(req.params.id)
    const updates = shelfUpdateSchema.parse(req.body)
    return ok(req, res, { shelf: await updateShelf(await supplierFor(req), id, updates) })
  } catch (error) {
    return sendCatalogError(req, res, error, 'Update shelf failed')
  }
})

router.put('/:id/products', async (req, res) => {
  try {
    const id = shelfIdParam.parse(req.params.id)
    const { productIds } = shelfProductsSchema.parse(req.body)
    return ok(req, res, { shelf: await setShelfProducts(await supplierFor(req), id, productIds) })
  } catch (error) {
    return sendCatalogError(req, res, error, 'Set shelf products failed')
  }
})

router.patch('/:id/products', async (req, res) => {
  try {
    const id = shelfIdParam.parse(req.params.id)
    const change = shelfProductsChangeSchema.parse(req.body)
    return ok(req, res, { shelf: await changeShelfProducts(await supplierFor(req), id, change) })
  } catch (error) {
    return sendCatalogError(req, res, error, 'Change shelf products failed')
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const id = shelfIdParam.parse(req.params.id)
    return ok(req, res, await archiveShelf(await supplierFor(req), id))
  } catch (error) {
    return sendCatalogError(req, res, error, 'Archive shelf failed')
  }
})

export { router as shelvesRouter }
