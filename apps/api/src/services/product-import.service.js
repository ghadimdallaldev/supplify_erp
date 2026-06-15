import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { checkLimit } from '../lib/subscription.js'
import { escapeCsvField } from '../lib/sanitize-upload.js'
import { importImageFromUrl, assertSafeImageUrl } from './product-image-import.service.js'

const FIELD_ALIASES = {
  sku: ['sku', 'product_sku', 'item_sku'],
  name: ['name', 'product_name', 'title', 'item_name'],
  description: ['description', 'desc'],
  category: ['category', 'product_category'],
  unit: ['unit', 'uom', 'unit_of_measure'],
  price: ['price', 'unit_price', 'sell_price'],
  stock: ['stock', 'quantity', 'qty', 'available_qty', 'inventory'],
  image_url: ['image_url', 'image', 'photo', 'photo_url'],
}

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

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    throw new ValidationError('CSV must include a header row and at least one data row')
  }
  const headers = lines[0].split(',').map((h) => h.trim())
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    return { rowNumber: index + 2, raw: mapRow(headers, values) }
  })
  return { headers, rows }
}

function validateProductRow(mapped, rowNumber) {
  const errors = []
  if (!mapped.name) errors.push({ field: 'name', message: 'Name is required' })
  if (!mapped.sku) errors.push({ field: 'sku', message: 'SKU is required' })
  if (mapped.price !== undefined && mapped.price !== '' && Number.isNaN(Number(mapped.price))) {
    errors.push({ field: 'price', message: 'Price must be a number' })
  }
  if (mapped.stock !== undefined && mapped.stock !== '' && Number.isNaN(Number(mapped.stock))) {
    errors.push({ field: 'stock', message: 'Stock must be a number' })
  }
  return errors.length ? { rowNumber, errors } : null
}

export function previewProductImport(csvText, columnMapping = null) {
  const { headers, rows } = parseCsv(csvText)
  const preview = []
  const errors = []
  const skuSet = new Set()

  for (const { rowNumber, raw } of rows) {
    const mapped = columnMapping ? applyColumnMapping(raw, columnMapping) : raw
    const validationError = validateProductRow(mapped, rowNumber)
    if (validationError) {
      errors.push(validationError)
      preview.push({ rowNumber, mapped, status: 'error', errors: validationError.errors })
      continue
    }
    const duplicateInFile = skuSet.has(mapped.sku)
    if (!duplicateInFile) skuSet.add(mapped.sku)
    preview.push({
      rowNumber,
      mapped,
      status: duplicateInFile ? 'duplicate_in_file' : 'valid',
      errors: duplicateInFile ? [{ field: 'sku', message: 'Duplicate SKU in file' }] : [],
    })
  }

  return {
    headers,
    preview: preview.slice(0, 100),
    totalRows: rows.length,
    validCount: preview.filter((p) => p.status === 'valid').length,
    errorCount: errors.length + preview.filter((p) => p.status === 'duplicate_in_file').length,
    errors,
  }
}

function applyColumnMapping(raw, mapping) {
  const mapped = {}
  for (const [field, sourceCol] of Object.entries(mapping)) {
    if (sourceCol && raw[sourceCol] !== undefined) mapped[field] = raw[sourceCol]
  }
  return mapped
}

export async function executeProductImport(supplierId, csvText, { partial = true, userId } = {}) {
  const { rows } = parseCsv(csvText)
  const summary = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    imagesImported: 0,
    imagesFailed: 0,
  }
  const rowErrors = []

  const importableRows = []
  for (const { rowNumber, raw } of rows) {
    const validationError = validateProductRow(raw, rowNumber)
    if (validationError) {
      if (!partial) {
        summary.failed += 1
        rowErrors.push(validationError)
      }
      continue
    }
    importableRows.push(raw)
  }

  if (importableRows.length > 0) {
    const skus = importableRows.map((raw) => String(raw.sku).toLowerCase())
    const { rows: existingProducts } = await query(
      `SELECT lower(sku) AS sku FROM product WHERE supplier_id = $1 AND lower(sku) = ANY($2::text[])`,
      [supplierId, skus]
    )
    const existingSkus = new Set(existingProducts.map((row) => row.sku))
    const newSkuCount = importableRows.filter(
      (raw) => !existingSkus.has(String(raw.sku).toLowerCase())
    ).length
    const updateSkuCount = importableRows.length - newSkuCount

    const limitCheck = await checkLimit(supplierId, 'SUPPLIER', 'supplier_products_skus')
    if (!limitCheck.isUnlimited) {
      const effectiveLimit = limitCheck.effectiveLimit ?? limitCheck.limit
      const projected = (limitCheck.current || 0) + newSkuCount
      if (effectiveLimit != null && (limitCheck.isOverLimit || projected > effectiveLimit)) {
        throw new ValidationError(
          `Product import would exceed your plan limit (${limitCheck.current}/${effectiveLimit} SKUs; ${newSkuCount} new, ${updateSkuCount} updates in file)`
        )
      }
    }
  }

  for (const { rowNumber, raw } of rows) {
    const validationError = validateProductRow(raw, rowNumber)
    if (validationError) {
      summary.failed += 1
      rowErrors.push(validationError)
      if (!partial) continue
      continue
    }

    try {
      const { rows: existing } = await query(
        `SELECT id FROM product WHERE supplier_id = $1 AND lower(sku) = lower($2)`,
        [supplierId, raw.sku]
      )

      let productId

      if (existing.length) {
        productId = existing[0].id
        await query(
          `
          UPDATE product SET
            name = COALESCE($3, name),
            description = COALESCE($4, description),
            category = COALESCE($5, category),
            unit = COALESCE($6, unit),
            updated_at = NOW()
          WHERE id = $1 AND supplier_id = $2
          `,
          [
            productId,
            supplierId,
            raw.name,
            raw.description || null,
            raw.category || null,
            raw.unit || null,
          ]
        )
        if (raw.price) {
          await query(
            `
            INSERT INTO price (product_id, amount, currency, valid_from)
            VALUES ($1, $2, 'USD', NOW())
            `,
            [productId, parseFloat(raw.price)]
          )
        }
        if (raw.stock) {
          await query(
            `
            INSERT INTO inventory (product_id, available_qty, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (product_id) DO UPDATE SET available_qty = $2, updated_at = NOW()
            `,
            [productId, parseFloat(raw.stock)]
          )
        }
        summary.updated += 1
      } else {
        const { rows: created } = await query(
          `
          INSERT INTO product (supplier_id, sku, name, description, category, unit)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
          `,
          [
            supplierId,
            raw.sku,
            raw.name,
            raw.description || null,
            raw.category || null,
            raw.unit || 'each',
          ]
        )
        productId = created[0].id
        if (raw.price) {
          await query(
            `INSERT INTO price (product_id, amount, currency, valid_from) VALUES ($1, $2, 'USD', NOW())`,
            [productId, parseFloat(raw.price)]
          )
        }
        await query(
          `
          INSERT INTO inventory (product_id, available_qty, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (product_id) DO NOTHING
          `,
          [productId, raw.stock ? parseFloat(raw.stock) : 0]
        )
        summary.created += 1
      }

      const imageUrl = raw.image_url?.trim()
      if (imageUrl) {
        try {
          assertSafeImageUrl(imageUrl)
          await importImageFromUrl({ url: imageUrl, supplierId, productId, userId })
          summary.imagesImported += 1
        } catch (err) {
          summary.imagesFailed += 1
          rowErrors.push({
            rowNumber,
            errors: [{ field: 'image_url', message: err.message || 'Image import failed' }],
          })
        }
      }
    } catch (err) {
      summary.failed += 1
      rowErrors.push({
        rowNumber,
        errors: [{ field: '_row', message: err.message || 'Import failed' }],
      })
      if (!partial) break
    }
  }

  return { summary, errors: rowErrors }
}

export function buildErrorReportCsv(errors) {
  const header = 'Row,Field,Message\n'
  const lines = []
  for (const row of errors) {
    for (const e of row.errors || []) {
      lines.push(
        [escapeCsvField(row.rowNumber), escapeCsvField(e.field), escapeCsvField(e.message)].join(
          ','
        )
      )
    }
  }
  return header + lines.join('\n')
}
