import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { requireRestaurantId } from '../lib/tenant-resolve.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { recipesMutationGuard } from '../lib/route-permissions.js'
import { escapeCsvField } from '../lib/sanitize-upload.js'
import {
  listRecipes,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deactivateRecipe,
  duplicateRecipe,
  getRecipeCostBreakdown,
  getRecipeCostingDashboard,
  listRecipeAlerts,
  listPriceImpacts,
  getIngredientImpact,
  recipesToCsvRows,
} from '../services/recipe.service.js'
import { recalculateRecipe } from '../services/recipe-recalc-queue.service.js'
import { query } from '../lib/db.js'

const recipeCostingFeatureGate = requireFeature(
  'recipe_costing',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

const ingredientSchema = z.object({
  ingredientType: z
    .enum(['SUPPLIER_PRODUCT', 'INVENTORY_ITEM', 'MANUAL'])
    .default('SUPPLIER_PRODUCT'),
  productId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  displayName: z.string().min(1).max(255),
  quantity: z.number().nonnegative(),
  recipeUnit: z.string().max(50).default('unit'),
  purchaseUnit: z.string().max(50).optional().nullable(),
  conversionFactor: z.number().positive().optional().nullable(),
  wastePct: z.number().min(0).max(99.999).default(0),
  yieldPct: z.number().positive().max(100).default(100),
  costSource: z
    .enum(['AUTO', 'INVOICE', 'LAST_RECEIVED', 'CONTRACT', 'CATALOG', 'MANUAL'])
    .default('AUTO'),
  manualUnitPrice: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
})

const recipeBodySchema = z.object({
  name: z.string().min(1).max(255),
  internalCode: z.string().max(100).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  sellingPrice: z.number().nonnegative().optional().nullable(),
  currency: z.string().max(10).optional(),
  targetFoodCostPct: z.number().positive().max(100).optional().nullable(),
  portionCount: z.number().positive().default(1),
  portionSize: z.number().nonnegative().optional().nullable(),
  yieldUnit: z.string().max(50).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  instructions: z.string().max(10000).optional().nullable(),
  imageFileKey: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  branchIds: z.array(z.string().uuid()).optional(),
  ingredients: z.array(ingredientSchema).optional(),
})

function canViewCosts(req) {
  const perms = req.tenantContext?.permissions || []
  return perms.includes('RECIPES_VIEW_COSTS')
}

function stripCosts(recipe) {
  if (!recipe) return recipe
  const {
    costPerPortion,
    foodCostPct,
    grossProfit,
    grossMarginPct,
    suggestedSellingPrice,
    lastPriceImpact,
    ...rest
  } = recipe
  return rest
}

function createRecipesRouter() {
  const router = express.Router()

  router.use(
    requireAuth,
    resolveTenantContext,
    requireRole(['RESTAURANT', 'ADMIN']),
    recipeCostingFeatureGate,
    requirePermission('RECIPES_VIEW'),
    recipesMutationGuard
  )

  router.get('/export.csv', async (req, res, next) => {
    try {
      if (!canViewCosts(req)) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Recipe cost export requires RECIPES_VIEW_COSTS' },
          requestId: req.requestId,
        })
      }
      const restaurantId = await requireRestaurantId(req)
      const rows = await recipesToCsvRows(restaurantId, req.query)
      const header =
        'Name,Category,Selling Price,Cost Per Portion,Food Cost %,Gross Margin %,Target Food Cost %,Status,Last Calculated\n'
      const lines = rows.map((r) =>
        [
          escapeCsvField(r.name),
          escapeCsvField(r.category || ''),
          r.sellingPrice ?? '',
          r.costPerPortion ?? '',
          r.foodCostPct ?? '',
          r.grossMarginPct ?? '',
          r.targetFoodCostPct ?? '',
          r.calcStatus,
          r.lastCalculatedAt || '',
        ].join(',')
      )
      const date = new Date().toISOString().slice(0, 10)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="recipes-${date}.csv"`)
      res.send(header + lines.join('\n') + '\n')
    } catch (err) {
      next(err)
    }
  })

  router.get('/', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200)
      const offset = parseInt(req.query.offset || '0', 10)
      const includeCosts = canViewCosts(req)
      const result = await listRecipes(
        restaurantId,
        {
          search: req.query.search,
          category: req.query.category,
          branchId: req.query.branchId,
          active: req.query.active,
          missingCost: req.query.missingCost,
          aboveTarget: req.query.aboveTarget,
          onTarget: req.query.onTarget,
          recentlyImpacted: req.query.recentlyImpacted,
          productId: req.query.productId,
        },
        { includeCosts, limit, offset }
      )
      if (!includeCosts) {
        result.recipes = result.recipes.map(stripCosts)
      }
      res.json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  })

  router.post('/', async (req, res, next) => {
    try {
      const parsed = recipeBodySchema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.message)
      const restaurantId = await requireRestaurantId(req)
      const recipe = await createRecipe(restaurantId, parsed.data, req.userData?.id)
      const payload = canViewCosts(req) ? recipe : stripCosts(recipe)
      res
        .status(201)
        .json({ ok: true, data: { recipe: payload }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  })

  router.get('/:id/print', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const recipe = await getRecipeById(restaurantId, req.params.id, {
        includeCosts: canViewCosts(req),
        includeIngredients: true,
      })
      res.json({
        ok: true,
        data: {
          printSheet: {
            name: recipe.name,
            portionCount: recipe.portionCount,
            portionSize: recipe.portionSize,
            yieldUnit: recipe.yieldUnit,
            notes: recipe.notes,
            instructions: recipe.instructions,
            ingredients: (recipe.ingredients || []).map((ing) => ({
              displayName: ing.displayName,
              quantity: ing.quantity,
              recipeUnit: ing.recipeUnit,
              notes: ing.notes,
            })),
          },
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/:id/cost-breakdown', async (req, res, next) => {
    try {
      if (!canViewCosts(req)) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Cost breakdown requires RECIPES_VIEW_COSTS' },
          requestId: req.requestId,
        })
      }
      const restaurantId = await requireRestaurantId(req)
      const breakdown = await getRecipeCostBreakdown(restaurantId, req.params.id)
      res.json({ ok: true, data: { breakdown }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  })

  router.post('/:id/recalculate', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      await recalculateRecipe(req.params.id, restaurantId, {
        triggeredBy: 'manual',
        userId: req.userData?.id,
      })
      const recipe = await getRecipeById(restaurantId, req.params.id, {
        includeCosts: canViewCosts(req),
      })
      res.json({
        ok: true,
        data: { recipe: canViewCosts(req) ? recipe : stripCosts(recipe) },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/:id/duplicate', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const recipe = await duplicateRecipe(restaurantId, req.params.id, req.userData?.id)
      res.status(201).json({
        ok: true,
        data: { recipe: canViewCosts(req) ? recipe : stripCosts(recipe) },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/:id/deactivate', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const result = await deactivateRecipe(restaurantId, req.params.id, req.userData?.id)
      res.json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  })

  router.get('/:id', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const recipe = await getRecipeById(restaurantId, req.params.id, {
        includeCosts: canViewCosts(req),
        includeIngredients: true,
      })
      res.json({
        ok: true,
        data: { recipe: canViewCosts(req) ? recipe : stripCosts(recipe) },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/:id', async (req, res, next) => {
    try {
      const parsed = recipeBodySchema.partial().safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.message)
      const restaurantId = await requireRestaurantId(req)
      const recipe = await updateRecipe(restaurantId, req.params.id, parsed.data, req.userData?.id)
      res.json({
        ok: true,
        data: { recipe: canViewCosts(req) ? recipe : stripCosts(recipe) },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  })

  return router
}

function createRecipeCostingRouter() {
  const router = express.Router()

  router.use(
    requireAuth,
    resolveTenantContext,
    requireRole(['RESTAURANT', 'ADMIN']),
    recipeCostingFeatureGate,
    requirePermission('RECIPES_VIEW'),
    recipesMutationGuard
  )

  router.get('/dashboard', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const dashboard = await getRecipeCostingDashboard(restaurantId)
      if (!canViewCosts(req)) {
        dashboard.highestCostRecipes = []
        dashboard.lowestMarginRecipes = []
        dashboard.stats.averageFoodCostPct = null
      }
      res.json({ ok: true, data: { dashboard }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  })

  router.get('/alerts', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200)
      const offset = parseInt(req.query.offset || '0', 10)
      const alerts = await listRecipeAlerts(restaurantId, { limit, offset })
      res.json({ ok: true, data: { alerts }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  })

  router.get('/price-impacts/export.csv', async (req, res, next) => {
    try {
      if (!canViewCosts(req)) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FORBIDDEN', message: 'Export requires RECIPES_VIEW_COSTS' },
          requestId: req.requestId,
        })
      }
      const restaurantId = await requireRestaurantId(req)
      const { impacts } = await listPriceImpacts(restaurantId, { limit: 500, offset: 0 })
      const header =
        'Product,Old Price,New Price,Change %,Recipe,Old Cost,New Cost,Old FC %,New FC %,Status\n'
      const lines = []
      for (const group of impacts) {
        const e = group.event
        for (const r of group.impactedRecipes) {
          lines.push(
            [
              escapeCsvField(e.productName || e.productId),
              e.oldPrice ?? '',
              e.newPrice,
              e.changePct ?? '',
              escapeCsvField(r.recipeName),
              r.oldCostPerPortion ?? '',
              r.newCostPerPortion ?? '',
              r.oldFoodCostPct ?? '',
              r.newFoodCostPct ?? '',
              r.status,
            ].join(',')
          )
        }
      }
      const date = new Date().toISOString().slice(0, 10)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="recipe-price-impacts-${date}.csv"`
      )
      res.send(header + lines.join('\n') + '\n')
    } catch (err) {
      next(err)
    }
  })

  router.get('/price-impacts', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const limit = Math.min(parseInt(req.query.limit || '20', 10), 100)
      const offset = parseInt(req.query.offset || '0', 10)
      const result = await listPriceImpacts(restaurantId, { limit, offset })
      if (!canViewCosts(req)) {
        result.impacts = result.impacts.map((group) => ({
          ...group,
          impactedRecipes: group.impactedRecipes.map((r) => ({
            recipeId: r.recipeId,
            recipeName: r.recipeName,
            status: r.status,
          })),
        }))
      }
      res.json({ ok: true, data: result, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  })

  router.post('/recalculate-impacted', async (req, res, next) => {
    try {
      const schema = z.object({ priceEventId: z.string().uuid() })
      const parsed = schema.safeParse(req.body)
      if (!parsed.success) throw new ValidationError(parsed.error.message)
      const restaurantId = await requireRestaurantId(req)
      const { rows } = await query(
        `
        SELECT rpi.recipe_id
        FROM recipe_price_impacts rpi
        JOIN supplier_price_events spe ON spe.id = rpi.price_event_id
        WHERE spe.id = $1 AND spe.restaurant_id = $2
        `,
        [parsed.data.priceEventId, restaurantId]
      )
      for (const row of rows) {
        await recalculateRecipe(row.recipe_id, restaurantId, {
          triggeredBy: 'bulk_recalc',
          userId: req.userData?.id,
        })
      }
      res.json({
        ok: true,
        data: { recalculated: rows.length },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/ingredient-impact/:productId', async (req, res, next) => {
    try {
      const restaurantId = await requireRestaurantId(req)
      const recipes = await getIngredientImpact(restaurantId, req.params.productId)
      const payload = canViewCosts(req)
        ? recipes
        : recipes.map((r) => ({ id: r.id, name: r.name, calcStatus: r.calcStatus }))
      res.json({ ok: true, data: { recipes: payload }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  })

  return router
}

export const recipesRoutes = createRecipesRouter()
export const recipeCostingRoutes = createRecipeCostingRouter()
