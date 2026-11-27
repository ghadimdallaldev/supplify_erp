/**
 * Admin catalog endpoints, mounted by admin.routes.js under `/api/admin`:
 * - `/category-requests`: list, approve, merge, reject supplier category requests.
 * - `/categories`: platform tree edits (add leaf, rename/aliases/icon, reorder).
 * Each router carries the admin guard itself, so it never touches other `/api/admin` paths.
 */
import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveAdminContext, requirePermission } from '../lib/rbac.js'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'
import { sendCatalogError } from '../lib/catalog-errors.js'
import {
  approveCategoryRequest,
  listCategoryRequests,
  mergeCategoryRequest,
  rejectCategoryRequest,
} from '../services/category-requests.service.js'
import {
  addLeafCategory,
  reorderPlatformCategories,
  updatePlatformCategory,
} from '../services/category-tree-admin.service.js'
import { CATEGORY_REQUEST_STATUSES } from './products/category-requests.js'

const adminGuard = [
  requireAuth,
  requireRole(['ADMIN']),
  resolveAdminContext,
  requirePermission(P.ADMIN_ACCESS),
]

const name = z.string().trim().min(1).max(80)
const optionalText = z.string().trim().max(80).nullable().optional()
const aliases = z.array(z.string().trim().min(1).max(80)).max(50)
const iconKey = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,40}$/)
  .nullable()
  .optional()
const uuid = z.string().uuid()

export const approveSchema = z.object({
  parentId: uuid.optional(),
  name: name.optional(),
  name_ar: optionalText,
  name_fr: optionalText,
  aliases: aliases.optional(),
  icon_key: iconKey,
})
export const mergeSchema = z.object({ categoryId: uuid })
export const rejectSchema = z.object({ note: z.string().trim().max(500).nullable().optional() })
export const addLeafSchema = z.object({
  parentId: uuid,
  name,
  name_ar: optionalText,
  name_fr: optionalText,
  aliases: aliases.optional(),
  icon_key: iconKey,
})
export const updateCategorySchema = z
  .object({
    name: name.optional(),
    name_ar: optionalText,
    name_fr: optionalText,
    aliases: aliases.optional(),
    icon_key: iconKey,
  })
  .strict()
export const reorderSchema = z.object({
  parentId: uuid.nullable(),
  ids: z.array(uuid).min(1).max(500),
})

const ok = (req, res, data, status = 200) =>
  res.status(status).json({ ok: true, data, error: null, requestId: req.requestId })
const actor = (req) => ({ adminUserId: req.userData?.id ?? null })

// ---- /api/admin/category-requests ------------------------------------------------------------
const requestsRouter = express.Router()
requestsRouter.use(...adminGuard)

requestsRouter.get('/', async (req, res) => {
  try {
    const { status } = z
      .object({ status: z.enum(CATEGORY_REQUEST_STATUSES).optional() })
      .parse(req.query)
    return ok(req, res, { requests: await listCategoryRequests({ status }) })
  } catch (error) {
    return sendCatalogError(req, res, error, 'Admin list category requests failed')
  }
})

requestsRouter.post('/:id/approve', async (req, res) => {
  try {
    const id = uuid.parse(req.params.id)
    return ok(req, res, await approveCategoryRequest(id, approveSchema.parse(req.body), actor(req)))
  } catch (error) {
    return sendCatalogError(req, res, error, 'Approve category request failed')
  }
})

requestsRouter.post('/:id/merge', async (req, res) => {
  try {
    const id = uuid.parse(req.params.id)
    return ok(req, res, await mergeCategoryRequest(id, mergeSchema.parse(req.body), actor(req)))
  } catch (error) {
    return sendCatalogError(req, res, error, 'Merge category request failed')
  }
})

requestsRouter.post('/:id/reject', async (req, res) => {
  try {
    const id = uuid.parse(req.params.id)
    return ok(req, res, await rejectCategoryRequest(id, rejectSchema.parse(req.body), actor(req)))
  } catch (error) {
    return sendCatalogError(req, res, error, 'Reject category request failed')
  }
})

// ---- /api/admin/categories -------------------------------------------------------------------
const categoriesRouter = express.Router()
categoriesRouter.use(...adminGuard)

categoriesRouter.post('/', async (req, res) => {
  try {
    return ok(req, res, { category: await addLeafCategory(addLeafSchema.parse(req.body)) }, 201)
  } catch (error) {
    return sendCatalogError(req, res, error, 'Add platform category failed')
  }
})

categoriesRouter.put('/order', async (req, res) => {
  try {
    const { parentId, ids } = reorderSchema.parse(req.body)
    return ok(req, res, { categories: await reorderPlatformCategories(parentId, ids) })
  } catch (error) {
    return sendCatalogError(req, res, error, 'Reorder platform categories failed')
  }
})

categoriesRouter.patch('/:id', async (req, res) => {
  try {
    const id = uuid.parse(req.params.id)
    const updates = updateCategorySchema.parse(req.body)
    return ok(req, res, { category: await updatePlatformCategory(id, updates) })
  } catch (error) {
    return sendCatalogError(req, res, error, 'Update platform category failed')
  }
})

export { requestsRouter as adminCategoryRequestsRouter, categoriesRouter as adminCategoriesRouter }
