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

export function buildCustomerImportErrorReportCsv(errors = []) {
  const lines = ['row_number,field,message']
  for (const row of errors) {
    for (const e of row.errors || []) {
      lines.push(`${row.rowNumber},"${e.field}","${String(e.message).replace(/"/g, '""')}"`)
    }
  }
  return lines.join('\n')
}

export async function executeCustomerImport(supplierId, csvText, { userId, partial = true } = {}) {
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

  for (const { rowNumber, raw } of rows) {
    const validationError = validateCustomerRow(raw, rowNumber)
    if (validationError) {
      summary.failed += 1
      rowErrors.push(validationError)
      if (!partial) continue
      continue
    }

    try {
      if (raw.email) {
        const { rows: dup } = await query(
          `SELECT id FROM supplier_customer_prospect
           WHERE supplier_id = $1 AND normalized_email = lower(trim($2))`,
          [supplierId, raw.email]
        )
        if (dup.length) {
          summary.skipped += 1
          continue
        }
      }
      const addressJson = raw.address ? { street: raw.address } : {}
      await query(
        `INSERT INTO supplier_customer_prospect (
           supplier_id, import_batch_id, restaurant_name, contact_person, phone, email,
           address_json, area_region, credit_limit, payment_terms, sales_rep, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
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
      summary.created += 1
    } catch (err) {
      if (err.code === '23505') {
        summary.skipped += 1
        continue
      }
      summary.failed += 1
      rowErrors.push({ rowNumber, errors: [{ field: 'row', message: err.message }] })
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
