import { query, withTransaction } from '../lib/db.js'
import { invalidateMenuCache } from './consumer-menu.service.js'

const FIELD_ALIASES = {
  category: ['category', 'category_name', 'section'],
  categoryDescription: ['category_description', 'section_description'],
  name: ['name', 'item_name', 'item', 'title'],
  price: ['price', 'base_price', 'amount'],
  description: ['description', 'desc', 'details'],
  available: ['available', 'is_available', 'active'],
  imageUrl: ['image_url', 'image', 'photo', 'photo_url'],
  sortOrder: ['sort_order', 'order', 'position'],
}

export const MENU_IMPORT_TEMPLATE = `category,name,price,description,available,image_url
Starters,Hummus & Bread,12.00,Classic chickpea dip with warm bread,true,
Starters,Mutabal,11.00,Smoky eggplant dip,true,
Mains,Chicken Shawarma,16.50,,true,
Drinks,Fresh Lemonade,5.00,,true,`

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

export function parseMenuImportCsv(text) {
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

function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === '') return defaultValue
  const normalized = String(value).trim().toLowerCase()
  if (['true', 'yes', '1', 'y'].includes(normalized)) return true
  if (['false', 'no', '0', 'n'].includes(normalized)) return false
  return null
}

function validateMenuRow(mapped, rowNumber) {
  const errors = []
  if (!mapped.category) errors.push({ field: 'category', message: 'Category is required' })
  if (!mapped.name) errors.push({ field: 'name', message: 'Name is required' })
  if (mapped.price === undefined || mapped.price === '') {
    errors.push({ field: 'price', message: 'Price is required' })
  } else if (Number.isNaN(Number(mapped.price)) || Number(mapped.price) < 0) {
    errors.push({ field: 'price', message: 'Price must be a non-negative number' })
  }
  if (mapped.available !== undefined && mapped.available !== '') {
    if (parseBoolean(mapped.available, null) === null) {
      errors.push({ field: 'available', message: 'Available must be true/false, yes/no, or 1/0' })
    }
  }
  if (mapped.sortOrder !== undefined && mapped.sortOrder !== '') {
    if (!Number.isInteger(Number(mapped.sortOrder))) {
      errors.push({ field: 'sortOrder', message: 'Sort order must be an integer' })
    }
  }
  return errors.length ? { rowNumber, errors } : null
}

export function previewMenuImport(csvText) {
  const { headers, rows } = parseMenuImportCsv(csvText)
  const preview = []
  const errors = []

  for (const { rowNumber, raw } of rows) {
    const validationError = validateMenuRow(raw, rowNumber)
    if (validationError) {
      errors.push(validationError)
      preview.push({ rowNumber, mapped: raw, status: 'error', errors: validationError.errors })
      continue
    }
    preview.push({
      rowNumber,
      mapped: {
        ...raw,
        price: Number(raw.price),
        available: parseBoolean(raw.available, true),
      },
      status: 'valid',
      errors: [],
    })
  }

  return {
    headers,
    preview: preview.slice(0, 200),
    totalRows: rows.length,
    validCount: preview.filter((p) => p.status === 'valid').length,
    errorCount: preview.filter((p) => p.status === 'error').length,
    errors,
  }
}

async function findOrCreateCategory(client, restaurantId, branchId, name, description) {
  const { rows: existing } = await client.query(
    `
      SELECT id FROM menu_category
      WHERE restaurant_id = $1
        AND branch_id IS NOT DISTINCT FROM $2
        AND lower(trim(name)) = lower(trim($3))
      LIMIT 1
    `,
    [restaurantId, branchId, name]
  )
  if (existing.length) return existing[0].id

  const { rows: maxSort } = await client.query(
    `
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
      FROM menu_category
      WHERE restaurant_id = $1 AND branch_id IS NOT DISTINCT FROM $2
    `,
    [restaurantId, branchId]
  )

  const { rows: created } = await client.query(
    `
      INSERT INTO menu_category (restaurant_id, branch_id, name, description, sort_order, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id
    `,
    [restaurantId, branchId, name.trim(), description?.trim() || null, maxSort[0].next_sort]
  )
  return created[0].id
}

export async function executeMenuImport(
  restaurantId,
  csvText,
  { branchId = null, updateExisting = true } = {}
) {
  const { rows } = parseMenuImportCsv(csvText)
  const summary = { categoriesCreated: 0, itemsCreated: 0, itemsUpdated: 0, skipped: 0, failed: 0 }
  const rowErrors = []
  const categoryCache = new Map()

  await withTransaction(async (client) => {
    for (const { rowNumber, raw } of rows) {
      const validationError = validateMenuRow(raw, rowNumber)
      if (validationError) {
        summary.failed += 1
        rowErrors.push(validationError)
        continue
      }

      try {
        const categoryKey = raw.category.trim().toLowerCase()
        let categoryId = categoryCache.get(categoryKey)
        if (!categoryId) {
          const { rows: existingCat } = await client.query(
            `
              SELECT id FROM menu_category
              WHERE restaurant_id = $1
                AND branch_id IS NOT DISTINCT FROM $2
                AND lower(trim(name)) = lower(trim($3))
              LIMIT 1
            `,
            [restaurantId, branchId, raw.category]
          )
          if (existingCat.length) {
            categoryId = existingCat[0].id
          } else {
            categoryId = await findOrCreateCategory(
              client,
              restaurantId,
              branchId,
              raw.category,
              raw.categoryDescription
            )
            summary.categoriesCreated += 1
          }
          categoryCache.set(categoryKey, categoryId)
        }

        const basePrice = Number(raw.price)
        const isAvailable = parseBoolean(raw.available, true)
        const sortOrder =
          raw.sortOrder !== undefined && raw.sortOrder !== '' ? Number(raw.sortOrder) : 0

        const { rows: existingItem } = await client.query(
          `
            SELECT id FROM menu_item
            WHERE restaurant_id = $1
              AND branch_id IS NOT DISTINCT FROM $2
              AND category_id = $3
              AND lower(trim(name)) = lower(trim($4))
            LIMIT 1
          `,
          [restaurantId, branchId, categoryId, raw.name]
        )

        if (existingItem.length && updateExisting) {
          await client.query(
            `
              UPDATE menu_item
              SET
                description = COALESCE($1, description),
                base_price = $2,
                image_url = COALESCE($3, image_url),
                sort_order = COALESCE($4, sort_order),
                is_available = $5,
                updated_at = now()
              WHERE id = $6
            `,
            [
              raw.description?.trim() || null,
              basePrice,
              raw.imageUrl?.trim() || null,
              sortOrder,
              isAvailable,
              existingItem[0].id,
            ]
          )
          summary.itemsUpdated += 1
        } else if (existingItem.length) {
          summary.skipped += 1
        } else {
          await client.query(
            `
              INSERT INTO menu_item (
                restaurant_id, branch_id, category_id, name, description,
                base_price, image_url, sort_order, is_available
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
              restaurantId,
              branchId,
              categoryId,
              raw.name.trim(),
              raw.description?.trim() || null,
              basePrice,
              raw.imageUrl?.trim() || null,
              sortOrder,
              isAvailable,
            ]
          )
          summary.itemsCreated += 1
        }
      } catch (err) {
        summary.failed += 1
        rowErrors.push({
          rowNumber,
          errors: [{ field: '_row', message: err.message || 'Import failed' }],
        })
      }
    }
  })

  await invalidateMenuCache(restaurantId, branchId)

  return { summary, errors: rowErrors }
}
