import { query } from '../lib/db.js'
import { columnExists } from '../lib/ensure-tenant-branding-schema.js'
import { NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { getTenantBranding } from './branding.service.js'
import {
  resolveProductPricesBatch,
  getDefaultCatalogPricesBatch,
} from './resolve-product-price.service.js'
import { isFeatureEnabled } from '../lib/subscription.js'
import { listSupplierStockDisplay } from './supplier-stock.service.js'

const DEFAULT_PAGE_SIZE = 24

export function isUuid(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return typeof str === 'string' && uuidRegex.test(str)
}

async function buildPublicSupplierSelectFields() {
  const fields = ['s.id', 's.name', 's.organization_id']
  const [hasSlug, hasMinimumOrderAmount, hasPaymentTerms, hasPublicCatalogEnabled] =
    await Promise.all([
      columnExists('supplier', 'slug'),
      columnExists('supplier', 'minimum_order_amount'),
      columnExists('supplier', 'payment_terms'),
      columnExists('supplier', 'public_catalog_enabled'),
    ])
  if (hasSlug) {
    fields.push('s.slug')
  }
  if (hasMinimumOrderAmount) {
    fields.push('s.minimum_order_amount')
  }
  if (hasPaymentTerms) {
    fields.push('s.payment_terms')
  }
  if (hasPublicCatalogEnabled) {
    fields.push('s.public_catalog_enabled')
  }
  return fields.join(',\n  ')
}

async function publicCatalogEnabledFilter() {
  if (await columnExists('supplier', 'public_catalog_enabled')) {
    return 'AND s.public_catalog_enabled = true'
  }
  return 'AND FALSE'
}

async function publicCatalogEnabledPredicate(tableAlias = 's') {
  if (await columnExists('supplier', 'public_catalog_enabled')) {
    return `${tableAlias}.public_catalog_enabled = true`
  }
  return 'FALSE'
}
/**
 * Resolve the public supplier identity without merging tenant-specific
 * products. Product rows remain owned by their original supplier tenant.
 */
export async function resolveSupplierScope(idOrSlug, dbQuery = query) {
  const selectFields = await buildPublicSupplierSelectFields()
  const catalogFilter = await publicCatalogEnabledFilter()
  const byId = isUuid(idOrSlug)
  if (!byId && !(await columnExists('supplier', 'slug'))) {
    throw new NotFoundError('Supplier catalog not found')
  }
  const identityWhere = byId ? '(s.id = $1 OR so.id = $1)' : '(s.slug = $1 OR so.slug = $1)'
  const { rows } = await dbQuery(
    `
      SELECT DISTINCT ON (COALESCE(s.organization_id, s.id))
        ${selectFields},
        s.id AS tenant_id,
        COALESCE(so.id, s.id) AS public_id,
        COALESCE(so.name, s.name) AS public_name
      FROM supplier s
      LEFT JOIN supplier_organizations so ON so.id = s.organization_id
      WHERE ${identityWhere}
        ${catalogFilter}
      ORDER BY
        COALESCE(s.organization_id, s.id),
        s.is_branch_active DESC,
        s.is_main_branch DESC,
        s.created_at ASC
      `,
    [idOrSlug]
  )
  if (!rows.length) throw new NotFoundError('Supplier catalog not found')
  const representative = rows[0]
  if (!representative.organization_id) {
    return {
      ...representative,
      id: representative.public_id || representative.id,
      tenantId: representative.tenant_id || representative.id,
      supplierIds: [representative.tenant_id || representative.id],
    }
  }
  const { rows: tenantRows } = await dbQuery(
    `
      SELECT s.id
      FROM supplier s
      WHERE COALESCE(s.organization_id, s.id) = COALESCE($1, s.id)
        AND s.is_branch_active = TRUE
        ${catalogFilter}
      ORDER BY s.is_main_branch DESC, s.created_at ASC
      `,
    [representative.organization_id || representative.id]
  )
  return {
    ...representative,
    id: representative.public_id || representative.id,
    tenantId: representative.tenant_id || representative.id,
    supplierIds: tenantRows.map((tenant) => tenant.id),
  }
}
export async function resolvePublicSupplierByIdOrSlug(idOrSlug, dbQuery = query) {
  return resolveSupplierScope(idOrSlug, dbQuery)
}

async function listSupplierStockForScope(scope, productIds, dbQuery) {
  const rows = (
    await Promise.all(
      scope.supplierIds.map((tenantId) =>
        listSupplierStockDisplay(tenantId, { productIds, dbQuery })
      )
    )
  ).flat()
  const byProduct = new Map()
  for (const row of rows) {
    const current = byProduct.get(row.product_id) || 0
    byProduct.set(row.product_id, current + Number(row.available_qty || 0))
  }
  return [...byProduct.entries()].map(([product_id, available_qty]) => ({
    product_id,
    available_qty,
  }))
}

async function canExposeBranding(supplierId) {
  try {
    const enabled = await isFeatureEnabled(supplierId, 'SUPPLIER', 'custom_branding')
    return enabled
  } catch {
    return false
  }
}

export async function getPublicSupplierProfile(idOrSlug, dbQuery = query) {
  const row = await resolvePublicSupplierByIdOrSlug(idOrSlug, dbQuery)
  const brandingAllowed = await canExposeBranding(row.tenantId || row.id, dbQuery)

  let logoUrl = null
  let brandDisplayName = null
  let brandPrimary = null
  let brandAccent = null

  try {
    const branding = await getTenantBranding(row.tenantId || row.id, 'SUPPLIER')
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
    name: row.public_name || row.name,
    logoUrl,
    brandDisplayName,
    brandPrimary,
    brandAccent,
    minimumOrderAmount: row.minimum_order_amount != null ? Number(row.minimum_order_amount) : null,
    paymentTerms: row.payment_terms || null,
    publicCatalogEnabled: row.public_catalog_enabled === true,
  }
}

export async function listPublicSupplierProducts(
  supplierId,
  { page = 1, limit = DEFAULT_PAGE_SIZE, q, category } = {},
  dbQuery = query
) {
  const safeLimit = Math.min(Math.max(1, limit), 48)
  const offset = (Math.max(1, page) - 1) * safeLimit
  const scope = await resolveSupplierScope(supplierId, dbQuery)
  const params = [scope.supplierIds]
  const catalogEnabledPredicate = await publicCatalogEnabledPredicate('s')
  const where = ['p.supplier_id = ANY($1::uuid[])', catalogEnabledPredicate]
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

  // Products page, total count, and category list are independent — run in parallel.
  const [{ rows }, { rows: countRows }, { rows: categories }] = await Promise.all([
    dbQuery(
      `
      SELECT
        p.id,
        p.supplier_id,
        p.name,
        p.sku,
        p.category,
        p.unit,
        p.image_url,
        p.description
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      WHERE ${whereClause}
      ORDER BY p.name ASC
      LIMIT ${safeLimit} OFFSET ${offset}
      `,
      params
    ),
    dbQuery(
      `
      SELECT COUNT(*)::int AS total
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      WHERE ${whereClause}
      `,
      params
    ),
    dbQuery(
      `
      SELECT DISTINCT p.category
      FROM product p
      JOIN supplier s ON s.id = p.supplier_id
      WHERE p.supplier_id = ANY($1::uuid[])
        AND p.category IS NOT NULL
        AND p.category <> ''
        AND ${catalogEnabledPredicate}
      ORDER BY p.category ASC
      LIMIT 50
      `,
      [scope.supplierIds]
    ),
  ])

  const stockRows = rows.length
    ? await listSupplierStockForScope(
        scope,
        rows.map((row) => row.id),
        dbQuery
      )
    : []
  const stockByProductId = new Map(
    stockRows.map((row) => [row.product_id, Number(row.available_qty) > 0])
  )

  return {
    products: rows.map((row) => ({
      id: row.id,
      supplierId: row.supplier_id,
      name: row.name,
      sku: row.sku,
      category: row.category,
      unit: row.unit,
      imageUrl: row.image_url,
      description: row.description,
      inStock: stockByProductId.get(row.id) === true,
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
  const scope = await resolveSupplierScope(supplierId, dbQuery)
  const { rows } = await dbQuery(
    `
    SELECT 1 FROM supplier_blocklist
    WHERE supplier_id = ANY($1::uuid[]) AND restaurant_id = $2
    LIMIT 1
    `,
    [scope.supplierIds, restaurantId]
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
      supplierId: p.supplierId || supplierId,
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
  const scope = await resolveSupplierScope(idOrSlug, dbQuery)

  const { rows: countRows } = await dbQuery(
    `SELECT COUNT(*)::int AS total FROM product WHERE supplier_id = ANY($1::uuid[])`,
    [scope.supplierIds]
  )
  return {
    ...profile,
    productCount: countRows[0]?.total ?? 0,
  }
}
