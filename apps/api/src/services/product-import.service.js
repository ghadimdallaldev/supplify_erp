import path from 'node:path'
import * as XLSX from 'xlsx'
import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError, ConflictError } from '../middlewares/errorHandler.js'
import { checkLimit } from '../lib/subscription.js'
import { escapeCsvField, MAX_UPLOAD_BYTES } from '../lib/sanitize-upload.js'
import { logger } from '../lib/logger.js'
import { writeSystemAuditLog } from '../lib/audit.js'
import { importImageFromUrl, assertSafeImageUrl } from './product-image-import.service.js'

export const XLSX_MAX_BUFFER_BYTES = MAX_UPLOAD_BYTES
export const XLSX_MAX_SHEETS = 1
export const XLSX_MAX_ROWS = 5000
export const XLSX_MAX_COLS = 50
export const XLSX_PARSE_TIMEOUT_MS = 10_000

const OOXML_ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])

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

function cellToString(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return String(value).trim()
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

function isOoxmlZip(buffer) {
  return (
    buffer.length >= OOXML_ZIP_MAGIC.length &&
    buffer.subarray(0, OOXML_ZIP_MAGIC.length).equals(OOXML_ZIP_MAGIC)
  )
}

function assertNoFormulasInWorkbook(workbook) {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    for (const key of Object.keys(sheet)) {
      if (key.startsWith('!')) continue
      const cell = sheet[key]
      if (cell?.f != null || cell?.t === 'f') {
        throw new ValidationError('Spreadsheet formulas are not allowed')
      }
    }
  }
}

function parseXlsxBuffer(buffer) {
  if (buffer.length > XLSX_MAX_BUFFER_BYTES) {
    throw new ValidationError(`Spreadsheet exceeds maximum size of ${XLSX_MAX_BUFFER_BYTES} bytes`)
  }
  if (!isOoxmlZip(buffer)) {
    throw new ValidationError('Invalid .xlsx file: expected OOXML (ZIP) format')
  }

  const startedAt = Date.now()
  let formulaScan
  try {
    formulaScan = XLSX.read(buffer, { type: 'buffer', cellFormula: true, sheetStubs: true })
  } catch (err) {
    throw new ValidationError(err.message || 'Failed to parse spreadsheet')
  }
  assertNoFormulasInWorkbook(formulaScan)

  let workbook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, sheetStubs: false })
  } catch (err) {
    throw new ValidationError(err.message || 'Failed to parse spreadsheet')
  }
  if (Date.now() - startedAt > XLSX_PARSE_TIMEOUT_MS) {
    throw new ValidationError('Spreadsheet parsing timed out')
  }

  if (workbook.SheetNames.length === 0) {
    throw new ValidationError('Spreadsheet has no sheets')
  }
  if (workbook.SheetNames.length > XLSX_MAX_SHEETS) {
    throw new ValidationError(`Spreadsheet may contain at most ${XLSX_MAX_SHEETS} sheet`)
  }

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (data.length < 2) {
    throw new ValidationError('Spreadsheet must include a header row and at least one data row')
  }
  if (data.length - 1 > XLSX_MAX_ROWS) {
    throw new ValidationError(`Spreadsheet exceeds maximum of ${XLSX_MAX_ROWS} data rows`)
  }

  const headers = data[0].map(cellToString)
  if (headers.length > XLSX_MAX_COLS) {
    throw new ValidationError(`Spreadsheet exceeds maximum of ${XLSX_MAX_COLS} columns`)
  }

  const rows = data
    .slice(1)
    .filter((row) => row.some((cell) => cellToString(cell) !== ''))
    .map((row, index) => {
      if (row.length > XLSX_MAX_COLS) {
        throw new ValidationError(`Spreadsheet exceeds maximum of ${XLSX_MAX_COLS} columns`)
      }
      const values = headers.map((_, i) => cellToString(row[i]))
      return { rowNumber: index + 2, raw: mapRow(headers, values) }
    })
  return { headers, rows }
}

export function parseSpreadsheetBuffer(buffer, filename = 'import.csv') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ValidationError('Import file is empty or invalid')
  }
  const ext = path.extname(String(filename || '')).toLowerCase()
  if (ext === '.xls') {
    throw new ValidationError('Legacy .xls format is not supported. Use .xlsx or .csv')
  }
  if (ext === '.xlsx') {
    return parseXlsxBuffer(buffer)
  }
  if (ext === '.csv' || ext === '') {
    return parseCsv(buffer.toString('utf8'))
  }
  throw new ValidationError('Unsupported import file type. Use .csv or .xlsx')
}

export function parseImportFile(buffer, filename) {
  return parseSpreadsheetBuffer(buffer, filename)
}

function resolveParsedImport(input, filename) {
  if (typeof input === 'string') {
    return parseCsv(input)
  }
  return parseImportFile(input, filename || 'import.csv')
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

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function previewProductImport(fileInput, columnMapping = null, filename = null) {
  const { headers, rows } = resolveParsedImport(fileInput, filename)
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

async function batchPersistProducts(supplierId, importableRows, existingBySku) {
  const creates = []
  const updates = []

  for (const { rowNumber, raw } of importableRows) {
    const skuKey = String(raw.sku).toLowerCase()
    const existing = existingBySku.get(skuKey)
    if (existing) {
      updates.push({ rowNumber, raw, productId: existing.id })
    } else {
      creates.push({ rowNumber, raw })
    }
  }

  const skuToProductId = new Map()

  await withTransaction(async (client) => {
    if (creates.length > 0) {
      const { rows: inserted } = await client.query(
        `
        INSERT INTO product (supplier_id, sku, name, description, category, unit)
        SELECT $1, t.sku, t.name, t.description, t.category, t.unit
        FROM unnest(
          $2::text[],
          $3::text[],
          $4::text[],
          $5::text[],
          $6::text[]
        ) AS t(sku, name, description, category, unit)
        RETURNING id, lower(sku) AS sku
        `,
        [
          supplierId,
          creates.map(({ raw }) => raw.sku),
          creates.map(({ raw }) => raw.name),
          creates.map(({ raw }) => raw.description || null),
          creates.map(({ raw }) => raw.category || null),
          creates.map(({ raw }) => raw.unit || 'each'),
        ]
      )
      for (const row of inserted) {
        skuToProductId.set(row.sku, row.id)
      }
    }

    if (updates.length > 0) {
      await client.query(
        `
        UPDATE product AS p SET
          name = COALESCE(v.name, p.name),
          description = COALESCE(v.description, p.description),
          category = COALESCE(v.category, p.category),
          unit = COALESCE(v.unit, p.unit),
          updated_at = NOW()
        FROM unnest(
          $2::uuid[],
          $3::text[],
          $4::text[],
          $5::text[],
          $6::text[]
        ) AS v(id, name, description, category, unit)
        WHERE p.id = v.id AND p.supplier_id = $1
        `,
        [
          supplierId,
          updates.map(({ productId }) => productId),
          updates.map(({ raw }) => raw.name),
          updates.map(({ raw }) => raw.description || null),
          updates.map(({ raw }) => raw.category || null),
          updates.map(({ raw }) => raw.unit || null),
        ]
      )
      for (const { raw, productId } of updates) {
        skuToProductId.set(String(raw.sku).toLowerCase(), productId)
      }
    }

    const priceRows = importableRows
      .map(({ raw }) => {
        const amount = parseOptionalNumber(raw.price)
        if (amount == null) return null
        const productId = skuToProductId.get(String(raw.sku).toLowerCase())
        return productId ? { productId, amount } : null
      })
      .filter(Boolean)

    if (priceRows.length > 0) {
      await client.query(
        `
        INSERT INTO price (product_id, amount, currency, valid_from)
        SELECT t.product_id, t.amount, 'USD', NOW()
        FROM unnest($1::uuid[], $2::numeric[]) AS t(product_id, amount)
        `,
        [priceRows.map((r) => r.productId), priceRows.map((r) => r.amount)]
      )
    }

    const inventoryRows = importableRows
      .map(({ raw }) => {
        const productId = skuToProductId.get(String(raw.sku).toLowerCase())
        const qty = parseOptionalNumber(raw.stock)
        return productId ? { productId, qty: qty ?? 0 } : null
      })
      .filter(Boolean)

    if (inventoryRows.length > 0) {
      await client.query(
        `
        INSERT INTO inventory (product_id, available_qty, updated_at)
        SELECT t.product_id, t.qty, NOW()
        FROM unnest($1::uuid[], $2::numeric[]) AS t(product_id, qty)
        ON CONFLICT (product_id) DO UPDATE SET
          available_qty = EXCLUDED.available_qty,
          updated_at = NOW()
        `,
        [inventoryRows.map((r) => r.productId), inventoryRows.map((r) => r.qty)]
      )
    }
  })

  return { creates, updates, skuToProductId }
}

export async function executeProductImport(
  supplierId,
  fileInput,
  { partial = true, userId, filename = null } = {}
) {
  const { rows } = resolveParsedImport(fileInput, filename)
  const summary = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    imagesImported: 0,
    imagesFailed: 0,
  }
  const rowErrors = []

  const validatedRows = []
  for (const { rowNumber, raw } of rows) {
    const validationError = validateProductRow(raw, rowNumber)
    if (validationError) {
      summary.failed += 1
      rowErrors.push(validationError)
      if (!partial) continue
      continue
    }
    validatedRows.push({ rowNumber, raw })
  }

  if (validatedRows.length > 0) {
    const skus = validatedRows.map(({ raw }) => String(raw.sku).toLowerCase())
    const { rows: existingProducts } = await query(
      `SELECT id, lower(sku) AS sku FROM product WHERE supplier_id = $1 AND lower(sku) = ANY($2::text[])`,
      [supplierId, skus]
    )
    const existingBySku = new Map(existingProducts.map((row) => [row.sku, row]))
    const newSkuCount = validatedRows.filter(
      ({ raw }) => !existingBySku.has(String(raw.sku).toLowerCase())
    ).length

    const limitCheck = await checkLimit(supplierId, 'SUPPLIER', 'supplier_products_skus')
    if (!limitCheck.isUnlimited) {
      const effectiveLimit = limitCheck.effectiveLimit ?? limitCheck.limit
      const projected = (limitCheck.current || 0) + newSkuCount
      if (effectiveLimit != null && (limitCheck.isOverLimit || projected > effectiveLimit)) {
        throw new ValidationError(
          `Product import would exceed your plan limit (${limitCheck.current}/${effectiveLimit} SKUs; ${newSkuCount} new, ${validatedRows.length - newSkuCount} updates in file)`
        )
      }
    }

    try {
      const { creates, updates, skuToProductId } = await batchPersistProducts(
        supplierId,
        validatedRows,
        existingBySku
      )
      summary.created = creates.length
      summary.updated = updates.length

      for (const { rowNumber, raw } of validatedRows) {
        const imageUrl = raw.image_url?.trim()
        if (!imageUrl) continue
        const productId = skuToProductId.get(String(raw.sku).toLowerCase())
        if (!productId) continue
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
      summary.failed += validatedRows.length
      summary.created = 0
      summary.updated = 0
      rowErrors.push({
        rowNumber: null,
        errors: [{ field: '_batch', message: err.message || 'Batch import failed' }],
      })
      if (!partial) {
        throw err
      }
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

export function countProductImportRows(fileInput, filename = null) {
  if (typeof fileInput === 'string') {
    const lines = String(fileInput || '')
      .split(/\r?\n/)
      .filter((l) => l.trim())
    return Math.max(0, lines.length - 1)
  }
  return resolveParsedImport(fileInput, filename).rows.length
}

export async function createProductImportJob({
  supplierId,
  userId,
  csvText = null,
  fileBuffer = null,
  filename = null,
  partial = true,
  columnMapping = null,
  preview = null,
}) {
  const previewJson = {
    partial,
    columnMapping,
    preview,
    filename,
    rowCount:
      preview?.totalRows ??
      (csvText != null
        ? countProductImportRows(csvText)
        : countProductImportRows(fileBuffer, filename)),
  }
  if (csvText != null) {
    previewJson.csv = csvText
  } else if (fileBuffer != null) {
    previewJson.fileBuffer = Buffer.isBuffer(fileBuffer)
      ? fileBuffer.toString('base64')
      : fileBuffer
  } else {
    throw new ValidationError('Import job requires file content')
  }

  try {
    const { rows } = await query(
      `
        INSERT INTO catalog_product_import_job (
          supplier_id,
          status,
          preview_json,
          created_by
        )
        VALUES ($1, 'pending', $2, $3)
        RETURNING *
      `,
      [supplierId, JSON.stringify(previewJson), userId || null]
    )
    return rows[0]
  } catch (err) {
    if (err.code === '23505') {
      throw new ConflictError('A product import job is already in progress')
    }
    throw err
  }
}

export async function getProductImportJobStatus(jobId, supplierId) {
  const { rows } = await query(
    `
      SELECT id, supplier_id, status, preview_json, result_json, error_message, created_by, created_at, updated_at
      FROM catalog_product_import_job
      WHERE id = $1 AND supplier_id = $2
    `,
    [jobId, supplierId]
  )
  if (!rows.length) {
    throw new NotFoundError('Product import job not found')
  }

  const job = rows[0]
  const previewJson =
    typeof job.preview_json === 'string' ? JSON.parse(job.preview_json) : job.preview_json || {}
  const resultJson =
    typeof job.result_json === 'string' ? JSON.parse(job.result_json) : job.result_json

  return {
    jobId: job.id,
    status: job.status,
    rowCount: previewJson.rowCount ?? null,
    preview: previewJson.preview ?? null,
    result: resultJson ?? null,
    errorMessage: job.error_message,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  }
}

async function getProductImportJobById(jobId) {
  const { rows } = await query(`SELECT * FROM catalog_product_import_job WHERE id = $1`, [jobId])
  return rows[0] || null
}

async function updateProductImportJob(jobId, patch) {
  await query(
    `
      UPDATE catalog_product_import_job
      SET
        status = COALESCE($2, status),
        result_json = COALESCE($3, result_json),
        error_message = COALESCE($4, error_message),
        updated_at = now()
      WHERE id = $1
    `,
    [
      jobId,
      patch.status ?? null,
      patch.resultJson != null ? JSON.stringify(patch.resultJson) : null,
      patch.errorMessage ?? null,
    ]
  )
}

export async function processProductImportJob(jobId) {
  const job = await getProductImportJobById(jobId)
  if (!job) {
    throw new NotFoundError('Product import job not found')
  }
  if (!['pending', 'processing'].includes(job.status)) {
    return job
  }

  await updateProductImportJob(jobId, { status: 'processing' })

  const payload =
    typeof job.preview_json === 'string' ? JSON.parse(job.preview_json) : job.preview_json || {}
  const { csv, fileBuffer, filename, partial = true } = payload

  try {
    let fileInput
    let importFilename = filename
    if (fileBuffer) {
      fileInput = Buffer.from(fileBuffer, 'base64')
    } else if (csv) {
      fileInput = csv
    } else {
      throw new ValidationError('Import job missing file payload')
    }

    const result = await executeProductImport(job.supplier_id, fileInput, {
      partial,
      userId: job.created_by,
      filename: importFilename,
    })

    await updateProductImportJob(jobId, {
      status: 'completed',
      resultJson: result,
    })

    await writeSystemAuditLog({
      action_type: 'catalog.product_import.completed',
      actor_user_id: job.created_by,
      tenant_type: 'SUPPLIER',
      tenant_id: job.supplier_id,
      target_id: jobId,
      payload_json: {
        resource_type: 'catalog_product_import',
        ...(result.summary || {}),
      },
    })

    return await getProductImportJobById(jobId)
  } catch (err) {
    logger.error({ event: 'product_import.job_failed', jobId, error: err.message })
    await updateProductImportJob(jobId, {
      status: 'failed',
      errorMessage: err.message,
    })
    throw err
  }
}
