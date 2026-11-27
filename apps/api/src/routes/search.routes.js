import express from 'express'
import { tenantFeatureGate } from '../lib/tenant-feature-gate.js'
import { z } from 'zod'
import {
  requireAuth,
  resolveTenantContext,
  resolveAdminContext,
  requireAnyPermission,
  getRequestTenant,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { enrichProductsWithResolvedPricing } from '../services/resolve-product-price.service.js'
import { blockedExistsSql, catalogVisibleSql, followExistsSql } from '../lib/relationship.js'
import { applyRestaurantStockViewToRows } from '../lib/restaurant-catalog-view.js'
import { overlayProductRowsWithAuthoritativeStock } from '../services/supplier-stock.service.js'
import { toContainsPattern, toPrefixTsQuery } from '../lib/search-query.js'
import { leafCategoryColumnsSql, leafCategoryJoinSql } from '../lib/category-sql.js'
import { loadPlatformCategories } from '../lib/category-matcher.js'
import { matchCategoriesForQuery, productQueryCategoryIds } from '../lib/category-tree.js'

const router = express.Router()

const catalogReadAccess = requireAnyPermission('CATALOG_VIEW', 'ORDERS_VIEW', 'INVENTORY_VIEW')

router.use(
  requireAuth,
  resolveTenantContext,
  resolveAdminContext,
  tenantFeatureGate('global_search'),
  catalogReadAccess
)

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  grouped: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  limit: z
    .string()
    .transform((val) => {
      const n = parseInt(val, 10)
      const parsed = Number.isFinite(n) ? n : 10
      return Math.min(Math.max(parsed, 1), 50)
    })
    .default('10'),
})

const historyListSchema = z.object({
  entityType: z.enum(['product', 'supplier']).optional(),
  limit: z
    .string()
    .transform((val) => {
      const n = parseInt(val, 10)
      const parsed = Number.isFinite(n) ? n : 10
      return Math.min(Math.max(parsed, 1), 50)
    })
    .default('10'),
})

const historyUpsertSchema = z.object({
  entityType: z.enum(['product', 'supplier']),
  query: z.string().trim().min(1).max(200),
})

const historyDeleteSchema = z.object({
  entityType: z.enum(['product', 'supplier']).optional(),
  query: z.string().trim().min(1).max(200).optional(),
})

function resolveHistoryScope(req) {
  const userId = req.userData?.id
  if (!userId) {
    throw new ValidationError('User not found')
  }
  const tenant = req.tenantContext
  if (!tenant?.tenantId || !tenant?.tenantType) {
    throw new ValidationError('Tenant context required')
  }
  return {
    userId,
    tenantId: tenant.tenantId,
    tenantType: tenant.tenantType,
  }
}

const SEARCH_PRODUCT_COLUMNS = `
  p.id,
  p.sku,
  p.name,
  ${leafCategoryColumnsSql('lc')},
  p.unit,
  p.supplier_id,
  p.image_url,
  p.image_thumb_url
`

async function searchProducts(q, limit, restaurantId, categories) {
  // Search-as-you-type: prefix lexemes ("tom" -> "tom:*") plus a name substring match,
  // so partial words find "Tomatoes". The tsquery string is sanitised in toPrefixTsQuery.
  // A query naming a category ("خبز", "pain") also returns that category's products.
  const tsQuery = toPrefixTsQuery(q)
  if (!tsQuery) return []
  const params = [tsQuery, limit, toContainsPattern(q), productQueryCategoryIds(q, categories)]
  // Restaurants: catalog visibility (not blocked AND (follows OR public catalog)), org-level.
  let blocklistClause = ''
  let followedExpr = 'false'
  if (restaurantId) {
    blocklistClause = `AND ${catalogVisibleSql('$5::uuid', 's')}`
    followedExpr = followExistsSql('$5::uuid', 's')
    params.push(restaurantId)
  }

  const { rows } = await query(
    `
    SELECT
      ${SEARCH_PRODUCT_COLUMNS},
      s.name AS supplier_name,
      s.slug AS supplier_slug,
      ${followedExpr} AS is_followed,
      ts_rank(p.search_vector, to_tsquery('simple', $1)) AS search_rank
    FROM product p
    JOIN supplier s ON s.id = p.supplier_id
    ${leafCategoryJoinSql('p', 'lc')}
    WHERE (
      p.search_vector @@ to_tsquery('simple', $1)
      OR LOWER(p.name) LIKE $3
      OR lc.id = ANY($4::uuid[])
    )
    ${blocklistClause}
    ORDER BY search_rank DESC, p.name ASC
    LIMIT $2
    `,
    params
  )

  if (restaurantId && rows.length > 0) {
    const priced = await enrichProductsWithResolvedPricing(rows, restaurantId)
    return applyRestaurantStockViewToRows(await overlayProductRowsWithAuthoritativeStock(priced))
  }
  return rows
}

async function searchSuppliers(q, limit, restaurantId) {
  const params = [`%${q.toLowerCase()}%`, limit]
  // Blocked organisations are hidden; private-catalog suppliers still appear as a card.
  let blocklistClause = ''
  let followedExpr = 'false'
  if (restaurantId) {
    blocklistClause = `AND NOT ${blockedExistsSql('$3::uuid', 's')}`
    followedExpr = followExistsSql('$3::uuid', 's')
    params.push(restaurantId)
  }

  const { rows } = await query(
    `
    SELECT
      s.*,
      ${followedExpr} AS is_followed,
      COALESCE(stats.product_count, 0) AS product_count
    FROM supplier s
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT p.id)::int AS product_count
      FROM product p
      WHERE p.supplier_id = s.id
    ) stats ON true
    WHERE (
      LOWER(s.name) LIKE $1
      OR LOWER(COALESCE(s.contact_email, '')) LIKE $1
      OR LOWER(COALESCE(s.address_json->>'city', '')) LIKE $1
    )
    ${blocklistClause}
    ORDER BY s.name ASC
    LIMIT $2
    `,
    params
  )
  return rows
}

/**
 * Leaf categories whose name or alias matches `q`, with the caller's visible product count.
 * Restaurants only see categories that hold at least one catalog-visible product.
 */
async function searchCategories(q, restaurantId, supplierId, categories) {
  const matches = matchCategoriesForQuery(q, categories)
  if (!matches.length) return []
  const params = [matches.map((m) => m.id), supplierId]
  let visibleClause = ''
  if (restaurantId) {
    params.push(restaurantId)
    visibleClause = `AND ${catalogVisibleSql('$3::uuid', 's')}`
  }
  const { rows } = await query(
    `
    SELECT lc.id, COUNT(DISTINCT p.id)::int AS product_count
    FROM product p
    JOIN supplier s ON s.id = p.supplier_id
    ${leafCategoryJoinSql('p', 'lc')}
    WHERE lc.id = ANY($1::uuid[])
      AND ($2::uuid IS NULL OR p.supplier_id = $2)
      ${visibleClause}
    GROUP BY lc.id
    `,
    params
  )
  const counts = new Map(rows.map((r) => [r.id, r.product_count]))
  return matches
    .map(({ score: _score, ...m }) => ({ ...m, product_count: counts.get(m.id) ?? 0 }))
    .filter((m) => !restaurantId || m.product_count > 0)
}

// Unified search (optional grouped results)
router.get('/', async (req, res) => {
  try {
    const params = searchQuerySchema.parse(req.query)
    const tenant = await getRequestTenant(req)
    const restaurantId = tenant?.tenantType === 'RESTAURANT' ? tenant.tenantId : null

    const supplierId = tenant?.tenantType === 'SUPPLIER' ? tenant.tenantId : null
    const categories = await loadPlatformCategories()

    const [products, suppliers, categoryHits] = await Promise.all([
      searchProducts(params.q, params.limit, restaurantId, categories),
      searchSuppliers(params.q, params.limit, restaurantId),
      params.grouped ? searchCategories(params.q, restaurantId, supplierId, categories) : [],
    ])

    const data = params.grouped
      ? { products, suppliers, categories: categoryHits }
      : {
          results: [
            ...products.map((p) => ({ type: 'product', item: p })),
            ...suppliers.map((s) => ({ type: 'supplier', item: s })),
          ],
        }

    res.json({
      ok: true,
      data,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Search error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Search failed' },
      requestId: req.requestId,
    })
  }
})

// List recent search history
router.get('/history', async (req, res) => {
  try {
    const params = historyListSchema.parse(req.query)
    const { userId, tenantId, tenantType } = resolveHistoryScope(req)

    const conditions = ['user_id = $1', 'tenant_id = $2', 'tenant_type = $3']
    const queryParams = [userId, tenantId, tenantType]
    let paramIndex = 4

    if (params.entityType) {
      conditions.push(`entity_type = $${paramIndex}`)
      queryParams.push(params.entityType)
      paramIndex++
    }

    queryParams.push(params.limit)

    const { rows } = await query(
      `
      SELECT id, entity_type, query, created_at
      FROM search_history
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
      `,
      queryParams
    )

    res.json({
      ok: true,
      data: { history: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('List search history error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list search history' },
      requestId: req.requestId,
    })
  }
})

// Upsert a search history entry (moves query to top on repeat)
router.post('/history', async (req, res) => {
  try {
    const body = historyUpsertSchema.parse(req.body)
    const { userId, tenantId, tenantType } = resolveHistoryScope(req)

    const { rows } = await query(
      `
      INSERT INTO search_history (user_id, tenant_id, tenant_type, entity_type, query)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, tenant_id, tenant_type, entity_type, query)
      DO UPDATE SET created_at = now()
      RETURNING id, entity_type, query, created_at
      `,
      [userId, tenantId, tenantType, body.entityType, body.query]
    )

    res.status(201).json({
      ok: true,
      data: { entry: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Upsert search history error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to save search history' },
      requestId: req.requestId,
    })
  }
})

// Delete search history (single entry or all for entity type)
router.delete('/history', async (req, res) => {
  try {
    const params = historyDeleteSchema.parse(req.body ?? req.query)
    const { userId, tenantId, tenantType } = resolveHistoryScope(req)

    const conditions = ['user_id = $1', 'tenant_id = $2', 'tenant_type = $3']
    const queryParams = [userId, tenantId, tenantType]
    let paramIndex = 4

    if (params.entityType) {
      conditions.push(`entity_type = $${paramIndex}`)
      queryParams.push(params.entityType)
      paramIndex++
    }
    if (params.query) {
      conditions.push(`query = $${paramIndex}`)
      queryParams.push(params.query)
      paramIndex++
    }

    const { rowCount } = await query(
      `DELETE FROM search_history WHERE ${conditions.join(' AND ')}`,
      queryParams
    )

    res.json({
      ok: true,
      data: { deleted: rowCount ?? 0 },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid parameters',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }
    if (error instanceof ValidationError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Delete search history error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to delete search history' },
      requestId: req.requestId,
    })
  }
})

export { router as searchRoutes }
