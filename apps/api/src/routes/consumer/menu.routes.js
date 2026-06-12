import express from 'express'
import { z } from 'zod'
import { query } from '../../lib/db.js'
import {
  requireAuth,
  resolveTenantContext,
  requirePermission,
  requireRole,
} from '../../lib/rbac.js'
import { requireRestaurantId } from '../../lib/tenant-resolve.js'
import { logger } from '../../lib/logger.js'
import {
  getAdminMenu,
  getPublicMenu,
  invalidateMenuCache,
  resolveRestaurantBySlug,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
  createModifierOption,
  updateModifierOption,
  deleteModifierOption,
} from '../../services/consumer-menu.service.js'
import {
  previewMenuImport,
  executeMenuImport,
  MENU_IMPORT_TEMPLATE,
} from '../../services/consumer-menu-import.service.js'

const router = express.Router({ mergeParams: true })

const branchQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
})

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  branchId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

const itemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  basePrice: z.number().nonnegative(),
  branchId: z.string().uuid().nullable().optional(),
  imageUrl: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
})

const modifierGroupSchema = z.object({
  menuItemId: z.string().uuid(),
  name: z.string().min(1),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const modifierGroupUpdateSchema = modifierGroupSchema.omit({ menuItemId: true }).partial()

const modifierOptionSchema = z.object({
  modifierGroupId: z.string().uuid(),
  name: z.string().min(1),
  priceDelta: z.number().optional(),
  sortOrder: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
})

const modifierOptionUpdateSchema = modifierOptionSchema.omit({ modifierGroupId: true }).partial()

const menuImportSchema = z.object({
  csv: z.string().min(1),
  branchId: z.string().uuid().nullable().optional(),
  updateExisting: z.boolean().optional(),
})

function jsonOk(res, data) {
  res.json({ ok: true, data, error: null, requestId: res.req.requestId })
}

function jsonError(res, status, name, message, details) {
  res.status(status).json({
    ok: false,
    data: null,
    error: { name, message, ...(details ? { details } : {}) },
    requestId: res.req.requestId,
  })
}

/** Public: GET /api/public/consumer/:restaurantSlug/menu */
router.get('/', async (req, res) => {
  try {
    const { restaurantSlug } = req.params
    const { branchId } = branchQuerySchema.parse(req.query)
    const restaurant = await resolveRestaurantBySlug(restaurantSlug)
    if (!restaurant) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }
    const menu = await getPublicMenu(restaurant.id, branchId || null)
    jsonOk(res, { restaurant, menu })
  } catch (error) {
    logger.error('Public consumer menu fetch failed', { error: error.message })
    jsonError(res, 500, 'CONSUMER_MENU_ERROR', 'Unable to load menu')
  }
})

export const consumerMenuPublicRoutes = router

/** Admin menu CRUD at /api/consumer/menu */
export const consumerMenuAdminRoutes = express.Router()

consumerMenuAdminRoutes.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('CATALOG_VIEW'),
  requireRole(['RESTAURANT', 'ADMIN'])
)

consumerMenuAdminRoutes.get('/', async (req, res) => {
  try {
    const { branchId } = branchQuerySchema.parse(req.query)
    const restaurantId = await requireRestaurantId(req)
    const menu = await getAdminMenu(restaurantId, branchId || null)
    jsonOk(res, menu)
  } catch (error) {
    logger.error('Admin consumer menu fetch failed', { error: error.message })
    jsonError(res, 500, 'CONSUMER_MENU_ERROR', 'Unable to load menu')
  }
})

consumerMenuAdminRoutes.post('/categories', requirePermission('CATALOG_EDIT'), async (req, res) => {
  try {
    const body = categorySchema.parse(req.body)
    const restaurantId = await requireRestaurantId(req)
    const { rows } = await query(
      `
      INSERT INTO menu_category (restaurant_id, branch_id, name, description, sort_order, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        restaurantId,
        body.branchId ?? null,
        body.name,
        body.description ?? null,
        body.sortOrder ?? 0,
        body.isActive ?? true,
      ]
    )
    await invalidateMenuCache(restaurantId, body.branchId ?? null)
    jsonOk(res, { category: rows[0] })
  } catch (error) {
    logger.error('Create menu category failed', { error: error.message })
    jsonError(res, 400, 'CREATE_CATEGORY_ERROR', error.message || 'Unable to create category')
  }
})

consumerMenuAdminRoutes.patch(
  '/categories/:id',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const body = categorySchema.partial().parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const { rows } = await query(
        `
        UPDATE menu_category
        SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          branch_id = COALESCE($3, branch_id),
          sort_order = COALESCE($4, sort_order),
          is_active = COALESCE($5, is_active),
          updated_at = now()
        WHERE id = $6 AND restaurant_id = $7
        RETURNING *
        `,
        [
          body.name ?? null,
          body.description ?? null,
          body.branchId !== undefined ? body.branchId : null,
          body.sortOrder ?? null,
          body.isActive ?? null,
          req.params.id,
          restaurantId,
        ]
      )
      if (!rows.length) {
        return jsonError(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found')
      }
      await invalidateMenuCache(restaurantId, rows[0].branch_id)
      jsonOk(res, { category: rows[0] })
    } catch (error) {
      logger.error('Update menu category failed', { error: error.message })
      jsonError(res, 400, 'UPDATE_CATEGORY_ERROR', error.message || 'Unable to update category')
    }
  }
)

consumerMenuAdminRoutes.delete(
  '/categories/:id',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const { rows } = await query(
        `DELETE FROM menu_category WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
        [req.params.id, restaurantId]
      )
      if (!rows.length) {
        return jsonError(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found')
      }
      await invalidateMenuCache(restaurantId, rows[0].branch_id)
      jsonOk(res, { deleted: true })
    } catch (error) {
      logger.error('Delete menu category failed', { error: error.message })
      jsonError(res, 500, 'DELETE_CATEGORY_ERROR', 'Unable to delete category')
    }
  }
)

consumerMenuAdminRoutes.post('/items', requirePermission('CATALOG_EDIT'), async (req, res) => {
  try {
    const body = itemSchema.parse(req.body)
    const restaurantId = await requireRestaurantId(req)
    const { rows: cats } = await query(
      `SELECT id FROM menu_category WHERE id = $1 AND restaurant_id = $2`,
      [body.categoryId, restaurantId]
    )
    if (!cats.length) {
      return jsonError(res, 404, 'CATEGORY_NOT_FOUND', 'Category not found')
    }
    const { rows } = await query(
      `
      INSERT INTO menu_item (
        restaurant_id, branch_id, category_id, name, description, base_price, image_url, sort_order, is_available
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        restaurantId,
        body.branchId ?? null,
        body.categoryId,
        body.name,
        body.description ?? null,
        body.basePrice,
        body.imageUrl ?? null,
        body.sortOrder ?? 0,
        body.isAvailable ?? true,
      ]
    )
    await invalidateMenuCache(restaurantId, body.branchId ?? null)
    jsonOk(res, { item: rows[0] })
  } catch (error) {
    logger.error('Create menu item failed', { error: error.message })
    jsonError(res, 400, 'CREATE_ITEM_ERROR', error.message || 'Unable to create item')
  }
})

consumerMenuAdminRoutes.patch('/items/:id', requirePermission('CATALOG_EDIT'), async (req, res) => {
  try {
    const body = itemSchema.partial().parse(req.body)
    const restaurantId = await requireRestaurantId(req)
    const { rows } = await query(
      `
      UPDATE menu_item
      SET
        category_id = COALESCE($1, category_id),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        base_price = COALESCE($4, base_price),
        branch_id = COALESCE($5, branch_id),
        image_url = COALESCE($6, image_url),
        sort_order = COALESCE($7, sort_order),
        is_available = COALESCE($8, is_available),
        updated_at = now()
      WHERE id = $9 AND restaurant_id = $10
      RETURNING *
      `,
      [
        body.categoryId ?? null,
        body.name ?? null,
        body.description ?? null,
        body.basePrice ?? null,
        body.branchId !== undefined ? body.branchId : null,
        body.imageUrl !== undefined ? body.imageUrl : null,
        body.sortOrder ?? null,
        body.isAvailable ?? null,
        req.params.id,
        restaurantId,
      ]
    )
    if (!rows.length) {
      return jsonError(res, 404, 'ITEM_NOT_FOUND', 'Item not found')
    }
    await invalidateMenuCache(restaurantId, rows[0].branch_id)
    jsonOk(res, { item: rows[0] })
  } catch (error) {
    logger.error('Update menu item failed', { error: error.message })
    jsonError(res, 400, 'UPDATE_ITEM_ERROR', error.message || 'Unable to update item')
  }
})

consumerMenuAdminRoutes.delete(
  '/items/:id',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const { rows } = await query(
        `DELETE FROM menu_item WHERE id = $1 AND restaurant_id = $2 RETURNING *`,
        [req.params.id, restaurantId]
      )
      if (!rows.length) {
        return jsonError(res, 404, 'ITEM_NOT_FOUND', 'Item not found')
      }
      await invalidateMenuCache(restaurantId, rows[0].branch_id)
      jsonOk(res, { deleted: true })
    } catch (error) {
      logger.error('Delete menu item failed', { error: error.message })
      jsonError(res, 500, 'DELETE_ITEM_ERROR', 'Unable to delete item')
    }
  }
)

consumerMenuAdminRoutes.post(
  '/modifier-groups',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const body = modifierGroupSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const group = await createModifierGroup(restaurantId, body)
      jsonOk(res, { group })
    } catch (error) {
      logger.error('Create modifier group failed', { error: error.message })
      const status = error.name === 'ITEM_NOT_FOUND' ? 404 : 400
      jsonError(
        res,
        status,
        error.name || 'CREATE_MODIFIER_GROUP_ERROR',
        error.message || 'Unable to create modifier group'
      )
    }
  }
)

consumerMenuAdminRoutes.patch(
  '/modifier-groups/:id',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const body = modifierGroupUpdateSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const group = await updateModifierGroup(restaurantId, req.params.id, body)
      jsonOk(res, { group })
    } catch (error) {
      logger.error('Update modifier group failed', { error: error.message })
      const status = error.name === 'MODIFIER_GROUP_NOT_FOUND' ? 404 : 400
      jsonError(
        res,
        status,
        error.name || 'UPDATE_MODIFIER_GROUP_ERROR',
        error.message || 'Unable to update modifier group'
      )
    }
  }
)

consumerMenuAdminRoutes.delete(
  '/modifier-groups/:id',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      await deleteModifierGroup(restaurantId, req.params.id)
      jsonOk(res, { deleted: true })
    } catch (error) {
      logger.error('Delete modifier group failed', { error: error.message })
      const status = error.name === 'MODIFIER_GROUP_NOT_FOUND' ? 404 : 500
      jsonError(
        res,
        status,
        error.name || 'DELETE_MODIFIER_GROUP_ERROR',
        error.message || 'Unable to delete modifier group'
      )
    }
  }
)

consumerMenuAdminRoutes.post(
  '/modifier-options',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const body = modifierOptionSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const option = await createModifierOption(restaurantId, body)
      jsonOk(res, { option })
    } catch (error) {
      logger.error('Create modifier option failed', { error: error.message })
      const status = error.name === 'MODIFIER_GROUP_NOT_FOUND' ? 404 : 400
      jsonError(
        res,
        status,
        error.name || 'CREATE_MODIFIER_OPTION_ERROR',
        error.message || 'Unable to create modifier option'
      )
    }
  }
)

consumerMenuAdminRoutes.patch(
  '/modifier-options/:id',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const body = modifierOptionUpdateSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const option = await updateModifierOption(restaurantId, req.params.id, body)
      jsonOk(res, { option })
    } catch (error) {
      logger.error('Update modifier option failed', { error: error.message })
      const status = error.name === 'MODIFIER_OPTION_NOT_FOUND' ? 404 : 400
      jsonError(
        res,
        status,
        error.name || 'UPDATE_MODIFIER_OPTION_ERROR',
        error.message || 'Unable to update modifier option'
      )
    }
  }
)

consumerMenuAdminRoutes.delete(
  '/modifier-options/:id',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      await deleteModifierOption(restaurantId, req.params.id)
      jsonOk(res, { deleted: true })
    } catch (error) {
      logger.error('Delete modifier option failed', { error: error.message })
      const status = error.name === 'MODIFIER_OPTION_NOT_FOUND' ? 404 : 500
      jsonError(
        res,
        status,
        error.name || 'DELETE_MODIFIER_OPTION_ERROR',
        error.message || 'Unable to delete modifier option'
      )
    }
  }
)

consumerMenuAdminRoutes.get('/import/template', requirePermission('CATALOG_VIEW'), (_req, res) => {
  jsonOk(res, { csv: MENU_IMPORT_TEMPLATE })
})

consumerMenuAdminRoutes.post(
  '/import/preview',
  requirePermission('CATALOG_EDIT'),
  async (req, res) => {
    try {
      const body = menuImportSchema.parse(req.body)
      const preview = previewMenuImport(body.csv)
      jsonOk(res, preview)
    } catch (error) {
      logger.error('Menu import preview failed', { error: error.message })
      jsonError(
        res,
        400,
        error.name || 'MENU_IMPORT_PREVIEW_ERROR',
        error.message || 'Unable to preview import'
      )
    }
  }
)

consumerMenuAdminRoutes.post('/import', requirePermission('CATALOG_EDIT'), async (req, res) => {
  try {
    const body = menuImportSchema.parse(req.body)
    const restaurantId = await requireRestaurantId(req)
    const result = await executeMenuImport(restaurantId, body.csv, {
      branchId: body.branchId ?? null,
      updateExisting: body.updateExisting ?? true,
    })
    jsonOk(res, result)
  } catch (error) {
    logger.error('Menu import failed', { error: error.message })
    jsonError(res, 400, error.name || 'MENU_IMPORT_ERROR', error.message || 'Unable to import menu')
  }
})
