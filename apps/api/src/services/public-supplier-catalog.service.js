import { query } from '../lib/db.js'
import { columnExists } from '../lib/ensure-tenant-branding-schema.js'
import { NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { getTenantBranding } from './branding.service.js'
import {
  resolveProductPricesBatch,
  getDefaultCatalogPricesBatch,
} from './resolve-product-price.service.js'
import { isFeatureEnabled } from '../lib/subscription.js'

const DEFAULT_PAGE_SIZE = 24

export function isUuid(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return typeof str === 'string' && uuidRegex.test(str)
}

async function buildPublicSupplierSelectFields() {
  const fields = ['s.id', 's.name']
  if (await columnExists('supplier', 'slug')) {
    fields.push('s.slug')
  }
  if (await columnExists('supplier', 'minimum_order_amount')) {
    fields.push('s.minimum_order_amount')
  }
  if (await columnExists('supplier', 'payment_terms')) {
    fields.push('s.payment_terms')
  }
  if (await columnExists('supplier', 'public_catalog_enabled')) {
    fields.push('s.public_catalog_enabled')
  }
  return fields.join(',\n  ')
}

async function publicCatalogEnabledFilter() {
  if (await columnExists('supplier', 'public_catalog_enabled')) {
    return 'AND s.public_catalog_enabled = true'
  }
  return ''
}

async function publicCatalogEnabledPredicate(tableAlias = 's') {
  if (await columnExists('supplier', 'public_catalog_enabled')) {
    return `${tableAlias}.public_catalog_enabled = true`
  }
  return 'TRUE'
}

export async function resolvePublicSupplierByIdOrSlug(idOrSlug, dbQuery = query) {
  const selectFields = await buildPublicSupplierSelectFields()
  const catalogFilter = await publicCatalogEnabledFilter()
  const byId = isUuid(idOrSlug)
  if (!byId && !(await columnExists('supplier', 'slug'))) {
    throw new NotFoundError('Supplier catalog not found')
  }
  const { rows } = await dbQuery(
    byId
      ? `
        SELECT ${selectFields}
        FROM supplier s
        WHERE s.id = $1
          ${catalogFilter}
        `
      : `
        SELECT ${selectFields}
        FROM supplier s
        WHERE s.slug = $1
          ${catalogFilter}
        `,
    [idOrSlug]
  )
  if (!rows.length) throw new NotFoundError('Supplier catalog not found')
  return rows[0]
}

async function canExposeBranding(supplierId, dbQuery = query) {
  try {
    const enabled = await isFeatureEnabled('custom_branding', supplierId, 'SUPPLIER')
    return enabled
  } catch {
    return false
  }
}

export async function getPublicSupplierProfile(idOrSlug, dbQuery = query) {
  const row = await resolvePublicSupplierByIdOrSlug(idOrSlug, dbQuery)
  const brandingAllowed = await canExposeBranding(row.id, dbQuery)

  let logoUrl = null
  let brandDisplayName = null
  let brandPrimary = null
  let brandAccent = null

  try {
    const branding = await getTenantBranding(row.id, 'SUPPLIER')
    logoUrl = branding.logoUrl
    if (brandingAllowed) {
      brandDisplayName = branding.brandDisplayName
      brandPrimary = branding.isDefault ? null : branding.brandPrimary
      brandAccent = branding.brandAccent
    }
  } catch {
    /* branding columns may be missing on older databases */
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl,
    brandDisplayName,
    brandPrimary,
    brandAccent,
    minimumOrderAmount: row.minimum_order_amount != null ? Number(row.minimum_order_amount) : null,
    paymentTerms: row.payment_terms || null,
    publicCatalogEnabled: row.public_catalog_enabled ?? true,
  }
}

export async function listPublicSupplierProducts(
  supplierId,
  { page = 1, limit = DEFAULT_PAGE_SIZE, q, category } = {},
  dbQuery = query
) {
  const safeLimit = Math.min(Math.max(1, limit), 48)
  const offset = (Math.max(1, page) - 1) * safeLimit
  const params = [supplierId]
  const catalogEnabledPredicate = await publicCatalogEnabledPredicate('s')
  const where = ['p.supplier_id = $1', catalogEnabledPredicate]
  let paramIndex = 2

  if (q) {
    where.push(`LOWER(p.name) LIKE $${paramIndex}`)
    params.push(`%${q.toLowerCase()}%`)
    paramIndex++
  }
  if (category) {
    where.push(`p.category = $${paramIndex}`)
    params.push(category)
    paramIndex++
  }

  const whereClause = where.join(' AND ')

  const { rows } = await dbQuery(
    `
    SELECT
      p.id,
      p.name,
      p.sku,
      p.category,
      p.unit,
      p.image_url,
      p.description,
      COALESCE(inv.total_available, 0) > 0 AS in_stock
    FROM product p
    JOIN supplier s ON s.id = p.supplier_id
    LEFT JOIN (
      SELECT product_id, SUM(available_qty) AS total_available
      FROM inventory
      GROUP BY product_id
    ) inv ON inv.product_id = p.id
    WHERE ${whereClause}
    ORDER BY p.name ASC
    LIMIT ${safeLimit} OFFSET ${offset}
    `,
    params
  )

  const { rows: countRows } = await dbQuery(
    `
    SELECT COUNT(*)::int AS total
    FROM product p
    JOIN supplier s ON s.id = p.supplier_id
    WHERE ${whereClause}
    `,
    params
  )

  const { rows: categories } = await dbQuery(
    `
    SELECT DISTINCT p.category
    FROM product p
    JOIN supplier s ON s.id = p.supplier_id
    WHERE p.supplier_id = $1
      AND p.category IS NOT NULL
      AND p.category <> ''
      AND ${catalogEnabledPredicate}
    ORDER BY p.category ASC
    LIMIT 50
    `,
    [supplierId]
  )

  return {
    products: rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      category: row.category,
      unit: row.unit,
      imageUrl: row.image_url,
      description: row.description,
      inStock: row.in_stock,
    })),
    categories: categories.map((c) => c.category).filter(Boolean),
    pagination: {
      page: Math.max(1, page),
      limit: safeLimit,
      total: countRows[0]?.total ?? 0,
    },
  }
}

export async function assertRestaurantNotBlocklisted(restaurantId, supplierId, dbQuery = query) {
  const { rows } = await dbQuery(
    `
    SELECT 1 FROM supplier_blocklist
    WHERE supplier_id = $1 AND restaurant_id = $2
    LIMIT 1
    `,
    [supplierId, restaurantId]
  )
  if (rows.length) {
    throw new ForbiddenError('You cannot order from this supplier')
  }
}

export async function listAuthenticatedRestaurantProducts(
  supplierId,
  restaurantId,
  { page = 1, limit = DEFAULT_PAGE_SIZE, q, category } = {},
  dbQuery = query
) {
  await assertRestaurantNotBlocklisted(restaurantId, supplierId, dbQuery)

  const catalog = await listPublicSupplierProducts(
    supplierId,
    { page, limit, q, category },
    dbQuery
  )
  if (!catalog.products.length) return catalog

  const productIds = catalog.products.map((p) => p.id)
  const catalogByProductId = await getDefaultCatalogPricesBatch(productIds, dbQuery)
  const resolved = await resolveProductPricesBatch({
    restaurantId,
    items: catalog.products.map((p) => ({
      productId: p.id,
      supplierId,
      quantity: 1,
    })),
    catalogByProductId,
  })
  const priceMap = new Map(resolved.map((r) => [r.productId, r]))

  return {
    ...catalog,
    products: catalog.products.map((p) => {
      const price = priceMap.get(p.id)
      return {
        ...p,
        currentPrice: price?.unitPrice != null ? Number(price.unitPrice) : null,
        currency: price?.currency || 'USD',
        pricingSource: price?.source || null,
      }
    }),
  }
}

export async function getPublicSupplierCatalogSummary(idOrSlug, dbQuery = query) {
  const profile = await getPublicSupplierProfile(idOrSlug, dbQuery)
  const { rows: countRows } = await dbQuery(
    `SELECT COUNT(*)::int AS total FROM product WHERE supplier_id = $1`,
    [profile.id]
  )
  return {
    ...profile,
    productCount: countRows[0]?.total ?? 0,
  }
}
