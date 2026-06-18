import { query, withTransaction } from '../lib/db.js'
import { checkLimit } from '../lib/subscription.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { markReorderForecastDirty } from './reorder-forecast-cache.service.js'

const FIELD_ALIASES = {
  sku: ['sku', 'product_sku', 'item_sku'],
  productId: ['product_id', 'productid', 'id'],
  quantity: ['quantity', 'qty', 'amount'],
  reason: ['reason', 'note', 'notes', 'comment'],
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const INVENTORY_IMPORT_TEMPLATE = `sku,quantity,reason
RICE-5KG,25,Opening stock count
OIL-1L,12,
TOMATO-CRATE,8,Delivery from morning run`

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function mapRow(headers, values) {
  const row = {}
  headers.forEach((h, i) => {
    row[normalizeHeader(h)] = values[i]?.trim?.() ?? values[i]
  })
  const mapped = {}
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== '') {
        mapped[field] = row[alias]
        break
      }
    }
  }
  return mapped
}

function splitCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  values.push(current.trim())
  return values.map((v) => v.replace(/^"|"$/g, ''))
}

export function parseRestaurantInventoryImportCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
  if (lines.length < 2) {
    const err = new Error('CSV must include a header row and at least one data row')
    err.name = 'VALIDATION_ERROR'
    throw err
  }
  const headers = splitCsvLine(lines[0])
  const rows = lines.slice(1).map((line, index) => ({
    rowNumber: index + 2,
    raw: mapRow(headers, splitCsvLine(line)),
  }))
  return { headers, rows }
}

function validateInventoryRow(mapped) {
  const errors = []
  const hasSku = mapped.sku !== undefined && mapped.sku !== ''
  const hasProductId = mapped.productId !== undefined && mapped.productId !== ''

  if (!hasSku && !hasProductId) {
    errors.push({ field: 'sku', message: 'SKU or product_id is required' })
  }
  if (hasProductId && !UUID_RE.test(String(mapped.productId).trim())) {
    errors.push({ field: 'product_id', message: 'product_id must be a valid UUID' })
  }
  if (mapped.quantity === undefined || mapped.quantity === '') {
    errors.push({ field: 'quantity', message: 'Quantity is required' })
  } else {
    const qty = Number(mapped.quantity)
    if (Number.isNaN(qty) || qty <= 0) {
      errors.push({ field: 'quantity', message: 'Quantity must be a positive number' })
    }
  }
  return errors.length ? errors : null
}

async function resolveProductForRow(restaurantId, mapped, productCache) {
  if (mapped.productId) {
    const key = `id:${mapped.productId}`
    if (productCache.has(key)) return productCache.get(key)

    const { rows } = await query(`SELECT id, sku, name FROM product WHERE id = $1 LIMIT 1`, [
      mapped.productId,
    ])
    const result =
      rows.length === 0
        ? { error: [{ field: 'product_id', message: 'Product not found' }] }
        : { product: rows[0] }
    productCache.set(key, result)
    return result
  }

  const skuKey = String(mapped.sku).trim().toLowerCase()
  const cacheKey = `sku:${skuKey}`
  if (productCache.has(cacheKey)) return productCache.get(cacheKey)

  const { rows } = await query(
    `SELECT id, sku, name FROM product WHERE lower(trim(sku)) = $1 ORDER BY created_at ASC`,
    [skuKey]
  )

  let result
  if (rows.length === 0) {
    result = { error: [{ field: 'sku', message: 'Product not found for SKU' }] }
  } else if (rows.length > 1) {
    result = {
      error: [
        {
          field: 'sku',
          message: 'Ambiguous SKU — multiple products match; use product_id instead',
        },
      ],
    }
  } else {
    result = { product: rows[0] }
  }
  productCache.set(cacheKey, result)
  return result
}

async function buildRowPreview(restaurantId, rowNumber, raw, productCache, trackedProductIds) {
  const validationErrors = validateInventoryRow(raw)
  if (validationErrors) {
    return {
      rowNumber,
      mapped: raw,
      status: 'error',
      errors: validationErrors,
    }
  }

  const resolved = await resolveProductForRow(restaurantId, raw, productCache)
  if (resolved.error) {
    return {
      rowNumber,
      mapped: raw,
      status: 'error',
      errors: resolved.error,
    }
  }

  const product = resolved.product
  const quantity = Number(raw.quantity)
  const isNewSku = !trackedProductIds.has(product.id)

  return {
    rowNumber,
    mapped: {
      sku: product.sku,
      productId: product.id,
      productName: product.name,
      quantity,
      reason: raw.reason?.trim() || null,
    },
    status: 'valid',
    errors: [],
    isNewSku,
  }
}

export async function previewRestaurantInventoryImport(restaurantId, csvText) {
  const { headers, rows } = parseRestaurantInventoryImportCsv(csvText)
  const { rows: tracked } = await query(
    `SELECT product_id FROM restaurant_inventory WHERE restaurant_id = $1`,
    [restaurantId]
  )
  const trackedProductIds = new Set(tracked.map((row) => row.product_id))
  const productCache = new Map()
  const preview = []

  for (const { rowNumber, raw } of rows) {
    preview.push(
      await buildRowPreview(restaurantId, rowNumber, raw, productCache, trackedProductIds)
    )
  }

  const validRows = preview.filter((p) => p.status === 'valid')
  const newSkuCount = new Set(validRows.filter((p) => p.isNewSku).map((p) => p.mapped.productId))
    .size

  let limitWarning = null
  if (newSkuCount > 0) {
    const limitCheck = await checkLimit(restaurantId, 'RESTAURANT', 'restaurant_inventory_skus')
    if (!limitCheck.isUnlimited) {
      const effectiveLimit = limitCheck.effectiveLimit ?? limitCheck.limit
      const projected = (limitCheck.current || 0) + newSkuCount
      if (effectiveLimit != null && projected > effectiveLimit) {
        limitWarning = {
          meter: 'restaurant_inventory_skus',
          current: limitCheck.current || 0,
          limit: effectiveLimit,
          newSkusInFile: newSkuCount,
          projected,
        }
      }
    }
  }

  return {
    headers,
    preview: preview.slice(0, 200),
    totalRows: rows.length,
    validCount: validRows.length,
    errorCount: preview.filter((p) => p.status === 'error').length,
    newSkuCount,
    limitWarning,
    errors: preview
      .filter((p) => p.status === 'error')
      .map((p) => ({ rowNumber: p.rowNumber, errors: p.errors })),
  }
}

async function addInventoryRow(client, restaurantId, productId, quantity, reason) {
  const { rows: inventory } = await client.query(
    `
      SELECT quantity FROM restaurant_inventory
      WHERE restaurant_id = $1 AND product_id = $2
      FOR UPDATE
    `,
    [restaurantId, productId]
  )

  const balanceBefore = inventory.length > 0 ? Number(inventory[0].quantity) : 0
  const balanceAfter = balanceBefore + quantity

  if (inventory.length > 0) {
    await client.query(
      `
        UPDATE restaurant_inventory
        SET quantity = $1, updated_at = now()
        WHERE restaurant_id = $2 AND product_id = $3
      `,
      [balanceAfter, restaurantId, productId]
    )
  } else {
    await client.query(
      `
        INSERT INTO restaurant_inventory (restaurant_id, product_id, quantity, updated_at)
        VALUES ($1, $2, $3, now())
      `,
      [restaurantId, productId, quantity]
    )
  }

  await client.query(
    `
      INSERT INTO inventory_movement_log (
        restaurant_id, product_id, type, quantity,
        balance_before, balance_after, reason, reference_type
      ) VALUES ($1, $2, 'ADD', $3, $4, $5, $6, 'BULK_IMPORT')
    `,
    [restaurantId, productId, quantity, balanceBefore, balanceAfter, reason || null]
  )

  return { balanceBefore, balanceAfter, created: inventory.length === 0 }
}

export async function executeRestaurantInventoryImport(restaurantId, csvText) {
  const { rows } = parseRestaurantInventoryImportCsv(csvText)
  const summary = { added: 0, updated: 0, failed: 0 }
  const rowErrors = []
  const productCache = new Map()
  const dirtyProductIds = new Set()

  const { rows: tracked } = await query(
    `SELECT product_id FROM restaurant_inventory WHERE restaurant_id = $1`,
    [restaurantId]
  )
  const trackedProductIds = new Set(tracked.map((row) => row.product_id))

  const importableRows = []
  for (const { rowNumber, raw } of rows) {
    const validationErrors = validateInventoryRow(raw)
    if (validationErrors) {
      summary.failed += 1
      rowErrors.push({ rowNumber, errors: validationErrors })
      continue
    }

    const resolved = await resolveProductForRow(restaurantId, raw, productCache)
    if (resolved.error) {
      summary.failed += 1
      rowErrors.push({ rowNumber, errors: resolved.error })
      continue
    }

    importableRows.push({
      rowNumber,
      productId: resolved.product.id,
      quantity: Number(raw.quantity),
      reason: raw.reason?.trim() || null,
      isNewSku: !trackedProductIds.has(resolved.product.id),
    })
    if (!trackedProductIds.has(resolved.product.id)) {
      trackedProductIds.add(resolved.product.id)
    }
  }

  const newSkuCount = importableRows.filter((row) => row.isNewSku).length
  if (newSkuCount > 0) {
    const limitCheck = await checkLimit(restaurantId, 'RESTAURANT', 'restaurant_inventory_skus')
    if (!limitCheck.isUnlimited) {
      const effectiveLimit = limitCheck.effectiveLimit ?? limitCheck.limit
      const projected = (limitCheck.current || 0) + newSkuCount
      if (effectiveLimit != null && (limitCheck.isOverLimit || projected > effectiveLimit)) {
        throw new ValidationError(
          `Inventory import would exceed your plan limit (${limitCheck.current}/${effectiveLimit} tracked SKUs; ${newSkuCount} new in file)`
        )
      }
    }
  }

  await withTransaction(async (client) => {
    for (const row of importableRows) {
      try {
        const result = await addInventoryRow(
          client,
          restaurantId,
          row.productId,
          row.quantity,
          row.reason
        )
        if (result.created) {
          summary.added += 1
        } else {
          summary.updated += 1
        }
        dirtyProductIds.add(row.productId)
      } catch (err) {
        summary.failed += 1
        rowErrors.push({
          rowNumber: row.rowNumber,
          errors: [{ field: '_row', message: err.message || 'Import failed' }],
        })
      }
    }
  })

  for (const productId of dirtyProductIds) {
    await markReorderForecastDirty(restaurantId, {
      productId,
      reason: 'inventory_import',
    })
  }

  return { summary, errors: rowErrors }
}
