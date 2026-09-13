import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'

const FIELD_ALIASES = {
  restaurant_name: ['restaurant_name', 'name', 'restaurant', 'business_name', 'company'],
  contact_person: ['contact_person', 'contact', 'contact_name', 'person'],
  phone: ['phone', 'phone_number', 'mobile', 'tel'],
  email: ['email', 'email_address', 'contact_email'],
  address: ['address', 'street_address', 'location'],
  area_region: ['area_region', 'area', 'region', 'city', 'zone'],
  credit_limit: ['credit_limit', 'credit', 'limit'],
  payment_terms: ['payment_terms', 'terms', 'net_terms'],
  sales_rep: ['sales_rep', 'sales_representative', 'rep', 'account_manager'],
  notes: ['notes', 'note', 'comments', 'remarks'],
}

const IMPORT_CONCURRENCY = 8

async function mapWithConcurrency(items, worker, concurrency = IMPORT_CONCURRENCY) {
  const results = new Array(items.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        if (index >= items.length) return
        results[index] = await worker(items[index])
      }
    })
  )

  return results
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

export function parseCsv(text) {
  // Parse RFC 4180-style records so customer names, notes, and addresses may
  // contain commas, escaped quotes, and newlines without shifting columns.
  const source = String(text || '').replace(/^\uFEFF/, '')
  const records = []
  let record = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      inQuotes = true
    } else if (char === ',') {
      record.push(field.trim())
      field = ''
    } else if (char === '\n') {
      record.push(field.trim())
      if (record.some((value) => value !== '')) records.push(record)
      record = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (inQuotes) throw new ValidationError('CSV contains an unterminated quoted field')
  record.push(field.trim())
  if (record.some((value) => value !== '')) records.push(record)

  if (records.length < 2) {
    throw new ValidationError('CSV must include a header row and at least one data row')
  }
  const headers = records[0]
  const rows = records.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    raw: mapRow(headers, values),
  }))
  return { headers, rows }
}
function validateCustomerRow(mapped, rowNumber) {
  const errors = []
  if (!mapped.restaurant_name) {
    errors.push({ field: 'restaurant_name', message: 'Restaurant name is required' })
  }
  if (mapped.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' })
  }
  if (mapped.credit_limit !== undefined && mapped.credit_limit !== '') {
    if (Number.isNaN(Number(mapped.credit_limit))) {
      errors.push({ field: 'credit_limit', message: 'Credit limit must be a number' })
    }
  }
  return errors.length ? { rowNumber, errors } : null
}

export function previewCustomerImport(csvText) {
  const { headers, rows } = parseCsv(csvText)
  const preview = []
  const errors = []
  const emailSet = new Set()

  for (const { rowNumber, raw } of rows) {
    const validationError = validateCustomerRow(raw, rowNumber)
    if (validationError) {
      errors.push(validationError)
      preview.push({ rowNumber, mapped: raw, status: 'error', errors: validationError.errors })
      continue
    }
    const normalizedEmail = raw.email ? raw.email.trim().toLowerCase() : null
    const duplicateInFile = normalizedEmail && emailSet.has(normalizedEmail)
    if (normalizedEmail && !duplicateInFile) emailSet.add(normalizedEmail)
    preview.push({
      rowNumber,
      mapped: raw,
      status: duplicateInFile ? 'duplicate_in_file' : 'valid',
      errors: duplicateInFile ? [{ field: 'email', message: 'Duplicate email in file' }] : [],
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

/**
 * Quote a value for CSV and neutralise spreadsheet formula injection.
 * The report is built from client-supplied text and then downloaded and opened in
 * Excel/Sheets, where a leading =, +, -, @, TAB or CR is executed as a formula.
 */
function csvCell(value) {
  const text = value == null ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function buildCustomerImportErrorReportCsv(errors = []) {
  const lines = ['row_number,field,message']
  for (const row of Array.isArray(errors) ? errors : []) {
    for (const e of row?.errors || []) {
      lines.push([csvCell(row?.rowNumber), csvCell(e?.field), csvCell(e?.message)].join(','))
    }
  }
  return lines.join('\n')
}

export async function executeCustomerImport(supplierId, csvText, { userId } = {}) {
  const { rows } = parseCsv(csvText)
  const summary = { created: 0, skipped: 0, failed: 0, batchId: null }
  const rowErrors = []

  const { rows: batchRows } = await query(
    `INSERT INTO supplier_customer_import_batch (supplier_id, status, total_rows, created_by)
     VALUES ($1, 'processing', $2, $3)
     RETURNING id`,
    [supplierId, rows.length, userId || null]
  )
  const batchId = batchRows[0].id
  summary.batchId = batchId

  const outcomes = await mapWithConcurrency(rows, async ({ rowNumber, raw }) => {
    const validationError = validateCustomerRow(raw, rowNumber)
    if (validationError) return { type: 'failed', rowError: validationError }

    try {
      const addressJson = raw.address ? { street: raw.address } : {}
      const { rows: inserted } = await query(
        `INSERT INTO supplier_customer_prospect (
           supplier_id, import_batch_id, restaurant_name, contact_person, phone, email,
           address_json, area_region, credit_limit, payment_terms, sales_rep, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)
         ON CONFLICT (supplier_id, normalized_email)
           WHERE normalized_email IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          supplierId,
          batchId,
          raw.restaurant_name,
          raw.contact_person || null,
          raw.phone || null,
          raw.email || null,
          JSON.stringify(addressJson),
          raw.area_region || null,
          raw.credit_limit ? Number(raw.credit_limit) : null,
          raw.payment_terms || null,
          raw.sales_rep || null,
          raw.notes || null,
        ]
      )
      return inserted.length ? { type: 'created' } : { type: 'skipped' }
    } catch (err) {
      if (err.code === '23505') return { type: 'skipped' }
      return {
        type: 'failed',
        rowError: { rowNumber, errors: [{ field: 'row', message: err.message }] },
      }
    }
  })

  for (const outcome of outcomes) {
    if (outcome.type === 'created') summary.created += 1
    else if (outcome.type === 'skipped') summary.skipped += 1
    else {
      summary.failed += 1
      rowErrors.push(outcome.rowError)
    }
  }

  await query(
    `UPDATE supplier_customer_import_batch
     SET status = 'completed', imported_rows = $2, failed_rows = $3
     WHERE id = $1`,
    [batchId, summary.created, summary.failed]
  )

  const { matchProspectsForSupplier } = await import('./supplier-customer-matching.service.js')
  await matchProspectsForSupplier(supplierId, { batchId })

  return { ...summary, rowErrors }
}
