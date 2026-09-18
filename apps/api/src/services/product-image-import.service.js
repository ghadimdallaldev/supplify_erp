import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import yauzl from 'yauzl'
import { query, withTransaction } from '../lib/db.js'
import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError, ConflictError } from '../middlewares/errorHandler.js'
import { ensureStorageForUpload } from '../lib/subscription.js'
import { writeSystemAuditLog } from '../lib/audit.js'
import { isTenantUnlockedForBackgroundWrites } from '../lib/background-write-locks.js'
import { assertPublicHttpUrl } from '../lib/ssrf-guard.js'
import { fetchPinnedPublic } from '../lib/pinned-fetch.js'
import {
  putObject,
  deleteObject,
  buildObjectPublicUrl,
  getObjectStream,
} from './storage/storage.service.js'
import { ensureObjectCleanForRead } from './storage/upload-security.service.js'
import {
  optimizeProductImage,
  isAllowedImageFilename,
  isSafeZipEntryPath,
} from './image-optimization.service.js'
import { MAX_UPLOAD_BYTES, assertUploadFileBytes, escapeCsvField } from '../lib/sanitize-upload.js'
import { scanBuffer } from './storage/malware-scanner.js'

const PREVIEW_ROW_CAP = 200
const BATCH_SIZE = 50
const URL_FETCH_TIMEOUT_MS = 15_000
const ZIP_MAX_ENTRIES = 10_000
const ZIP_MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
const ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES = 10 * 1024 * 1024
const ZIP_MAX_PATH_DEPTH = 10
const ZIP_MAX_PROCESSING_MS = 60_000

const MAPPING_FIELD_ALIASES = {
  sku: ['sku', 'product_code', 'barcode'],
  imageFile: ['imagefile', 'image_file', 'file'],
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
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

export function normalizeSkuKey(sku) {
  return String(sku || '')
    .trim()
    .toLowerCase()
}

export function extractFilenameStem(fileName) {
  const base = path.basename(String(fileName || ''))
  const stem = path.basename(base, path.extname(base))
  return stem.toLowerCase()
}

function mapMappingRow(headers, values) {
  const row = {}
  headers.forEach((h, i) => {
    row[normalizeHeader(h)] = values[i]?.trim?.() ?? values[i]
  })
  const mapped = {}
  for (const [field, aliases] of Object.entries(MAPPING_FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== '') {
        mapped[field] = row[alias]
        break
      }
    }
  }
  return mapped
}

export function parseMappingCsv(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
  if (lines.length < 2) {
    throw new ValidationError('CSV must include a header row and at least one data row')
  }
  const headers = splitCsvLine(lines[0])
  const rows = lines.slice(1).map((line, index) => ({
    rowNumber: index + 2,
    ...mapMappingRow(headers, splitCsvLine(line)),
  }))
  return rows
}

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) reject(err)
      else resolve(zipfile)
    })
  })
}

export function listZipImageEntries(zipPath) {
  return new Promise((resolve, reject) => {
    const entries = []
    const limits = createZipLimitState()
    let settled = false
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)

      const fail = (error) => {
        if (settled) return
        settled = true
        zipfile.close()
        reject(error)
      }

      zipfile.on('entry', (entry) => {
        try {
          assertZipEntryWithinLimits(limits, entry)
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry()
            return
          }
          if (!isSafeZipEntryPath(entry.fileName) || !isAllowedImageFilename(entry.fileName)) {
            zipfile.readEntry()
            return
          }
          entries.push({
            fileName: entry.fileName,
            uncompressedSize: entry.uncompressedSize,
          })
          zipfile.readEntry()
        } catch (error) {
          fail(error)
        }
      })
      zipfile.on('end', () => {
        if (settled) return
        settled = true
        resolve(entries)
      })
      zipfile.on('error', fail)
      zipfile.readEntry()
    })
  })
}

function findZipEntryByFileName(zipEntries, imageFile) {
  const needle = String(imageFile || '').trim()
  if (!needle) return null
  const needleLower = needle.toLowerCase()
  const needleBase = path.basename(needleLower)
  return (
    zipEntries.find((e) => e.fileName.toLowerCase() === needleLower) ||
    zipEntries.find((e) => path.basename(e.fileName).toLowerCase() === needleBase) ||
    null
  )
}

function buildProductSkuIndex(products) {
  const bySku = new Map()
  for (const product of products) {
    bySku.set(normalizeSkuKey(product.sku), product)
  }
  return bySku
}

function shouldSkipExistingProduct(product, replaceExisting) {
  return !replaceExisting && Boolean(product.image_url)
}

export function buildImageMatches({
  method,
  zipEntries = [],
  products = [],
  mappingRows = [],
  replaceExisting = false,
}) {
  const productBySku = buildProductSkuIndex(products)
  const matchedProductIds = new Set()
  const usedZipFiles = new Set()
  const matches = []
  const unmatchedFiles = []
  const unmatchedProducts = []
  const duplicates = []
  const invalidRows = []
  const skippedExisting = []

  const productsWithImages = products.filter((p) => Boolean(p.image_url)).length
  const matchedProductIdSet = new Set()

  if (method === 'zip_sku') {
    for (const entry of zipEntries) {
      const stem = extractFilenameStem(entry.fileName)
      const fileKey = entry.fileName.toLowerCase()

      if (usedZipFiles.has(fileKey)) {
        duplicates.push({
          type: 'duplicate_file',
          fileName: entry.fileName,
          reason: 'Duplicate filename in ZIP',
        })
        continue
      }
      usedZipFiles.add(fileKey)

      const product = productBySku.get(stem)
      if (!product) {
        unmatchedFiles.push({
          fileName: entry.fileName,
          stem,
          reason: 'No product with matching SKU',
        })
        continue
      }

      if (matchedProductIds.has(product.id)) {
        duplicates.push({
          type: 'duplicate_product',
          fileName: entry.fileName,
          sku: product.sku,
          reason: 'Product already matched by another file',
        })
        continue
      }

      if (shouldSkipExistingProduct(product, replaceExisting)) {
        skippedExisting.push({
          productId: product.id,
          sku: product.sku,
          fileName: entry.fileName,
          reason: 'Product already has an image',
        })
        continue
      }

      matchedProductIds.add(product.id)
      matchedProductIdSet.add(product.id)
      matches.push({
        productId: product.id,
        sku: product.sku,
        fileName: entry.fileName,
      })
    }
  } else if (method === 'zip_mapping') {
    for (const row of mappingRows) {
      if (!row.sku || !row.imageFile) {
        invalidRows.push({
          rowNumber: row.rowNumber,
          sku: row.sku || '',
          imageFile: row.imageFile || '',
          reason: 'SKU and ImageFile are required',
        })
        continue
      }

      const product = productBySku.get(normalizeSkuKey(row.sku))
      if (!product) {
        unmatchedProducts.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          imageFile: row.imageFile,
          reason: 'Product not found',
        })
        continue
      }

      const entry = findZipEntryByFileName(zipEntries, row.imageFile)
      if (!entry) {
        unmatchedFiles.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          fileName: row.imageFile,
          reason: 'Image file not found in ZIP',
        })
        continue
      }

      const fileKey = entry.fileName.toLowerCase()
      if (usedZipFiles.has(fileKey)) {
        duplicates.push({
          type: 'duplicate_file',
          rowNumber: row.rowNumber,
          sku: row.sku,
          fileName: entry.fileName,
          reason: 'ZIP entry already matched',
        })
        continue
      }

      if (matchedProductIds.has(product.id)) {
        duplicates.push({
          type: 'duplicate_product',
          rowNumber: row.rowNumber,
          sku: row.sku,
          fileName: entry.fileName,
          reason: 'Product already matched by another row',
        })
        continue
      }

      if (shouldSkipExistingProduct(product, replaceExisting)) {
        skippedExisting.push({
          rowNumber: row.rowNumber,
          productId: product.id,
          sku: product.sku,
          fileName: entry.fileName,
          reason: 'Product already has an image',
        })
        continue
      }

      usedZipFiles.add(fileKey)
      matchedProductIds.add(product.id)
      matchedProductIdSet.add(product.id)
      matches.push({
        productId: product.id,
        sku: product.sku,
        fileName: entry.fileName,
        rowNumber: row.rowNumber,
      })
    }
  } else {
    throw new ValidationError(`Unsupported import method for ZIP matching: ${method}`)
  }

  const productsWithoutImages = products.filter(
    (p) => !p.image_url && !matchedProductIdSet.has(p.id)
  ).length

  return {
    summary: {
      totalZipFiles: zipEntries.length,
      matched: matches.length,
      unmatchedFiles: unmatchedFiles.length,
      unmatchedProducts: unmatchedProducts.length,
      duplicates: duplicates.length,
      invalidRows: invalidRows.length,
      skippedExisting: skippedExisting.length,
      productsWithoutImages,
      productsWithImages,
    },
    matches: matches.slice(0, PREVIEW_ROW_CAP),
    unmatchedFiles: unmatchedFiles.slice(0, PREVIEW_ROW_CAP),
    unmatchedProducts: unmatchedProducts.slice(0, PREVIEW_ROW_CAP),
    duplicates: duplicates.slice(0, PREVIEW_ROW_CAP),
    invalidRows: invalidRows.slice(0, PREVIEW_ROW_CAP),
    skippedExisting: skippedExisting.slice(0, PREVIEW_ROW_CAP),
    allMatches: matches,
  }
}

async function loadTextFromStorage(fileKey) {
  const object = await getObjectStream(fileKey)
  const cleanObject = await ensureObjectCleanForRead(fileKey, object)
  const { body } = cleanObject
  const buffer = await readStoredBody(body, MAX_UPLOAD_BYTES)
  // Mapping files are CSV by contract. Some storage providers return
  // application/octet-stream, so do not let provider metadata bypass the
  // CSV byte-safety checks.
  assertUploadFileBytes(buffer, 'text/csv')
  return buffer.toString('utf8')
}

async function readStoredBody(body, maxBytes) {
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') {
    throw new ValidationError('Stored file could not be read')
  }
  const chunks = []
  let total = 0
  for await (const chunk of body) {
    const value = Buffer.from(chunk)
    total += value.length
    if (total > maxBytes) throw new ValidationError('Stored file exceeds the safety limit')
    chunks.push(value)
  }
  return Buffer.concat(chunks, total)
}

async function resolveZipPathFromStorage(fileKey) {
  const normalizedKey = String(fileKey || '').replace(/^\/+/, '')
  if (!normalizedKey || normalizedKey.includes('..')) {
    throw new ValidationError('Invalid ZIP file key')
  }

  const tmpPath = path.join(os.tmpdir(), `supplify-import-${randomUUID()}.zip`)
  const object = await getObjectStream(normalizedKey)
  const cleanObject = await ensureObjectCleanForRead(normalizedKey, object)
  await fs.writeFile(tmpPath, await readStoredBody(cleanObject.body, config.IMPORT_ZIP_MAX_BYTES), {
    mode: 0o600,
  })
  return tmpPath
}

async function loadSupplierProducts(supplierId) {
  const { rows } = await query(
    `
      SELECT id, sku, image_url, image_thumb_url
      FROM product
      WHERE supplier_id = $1
    `,
    [supplierId]
  )
  return rows
}

export async function previewImageImport({
  supplierId,
  method,
  zipFileKey,
  mappingFileKey,
  replaceExisting = false,
}) {
  if (!supplierId) throw new ValidationError('supplierId is required')
  if (!zipFileKey) throw new ValidationError('zipFileKey is required')
  if (method === 'zip_mapping' && !mappingFileKey) {
    throw new ValidationError('mappingFileKey is required for zip_mapping')
  }

  const products = await loadSupplierProducts(supplierId)
  let zipPath
  let tempZip = false

  try {
    zipPath = await resolveZipPathFromStorage(zipFileKey)
    tempZip = true
    const zipEntries = await listZipImageEntries(zipPath)

    let mappingRows = []
    if (method === 'zip_mapping') {
      const csvText = await loadTextFromStorage(mappingFileKey)
      mappingRows = parseMappingCsv(csvText)
    }

    const plan = buildImageMatches({
      method,
      zipEntries,
      products,
      mappingRows,
      replaceExisting,
    })

    return {
      method,
      replaceExisting,
      zipFileKey,
      mappingFileKey: mappingFileKey || null,
      ...plan,
    }
  } finally {
    if (tempZip && zipPath) {
      await fs.unlink(zipPath).catch(() => {})
    }
  }
}

export async function createImageImportJob({
  supplierId,
  userId,
  method,
  zipFileKey,
  mappingFileKey,
  replaceExisting = false,
  preview,
}) {
  if (!preview?.summary) {
    throw new ValidationError('preview is required')
  }

  const { rows } = await query(
    `
      INSERT INTO catalog_image_import_job (
        supplier_id,
        created_by_user_id,
        method,
        status,
        replace_existing,
        source_file_key,
        mapping_file_key,
        total_files,
        preview_json
      )
      VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      supplierId,
      userId || null,
      method,
      replaceExisting,
      zipFileKey,
      mappingFileKey || null,
      preview.summary.matched,
      JSON.stringify(preview),
    ]
  )
  return rows[0]
}

export async function getImageImportJob(jobId, supplierId) {
  const { rows } = await query(
    `
      SELECT *
      FROM catalog_image_import_job
      WHERE id = $1 AND supplier_id = $2
    `,
    [jobId, supplierId]
  )
  if (!rows.length) {
    throw new NotFoundError('Image import job not found')
  }
  return rows[0]
}

export async function cancelImageImportJob(jobId, supplierId) {
  const { rows } = await query(
    `
      UPDATE catalog_image_import_job
      SET status = 'cancelled', completed_at = now()
      WHERE id = $1
        AND supplier_id = $2
        AND status IN ('pending', 'processing')
      RETURNING *
    `,
    [jobId, supplierId]
  )
  if (!rows.length) {
    throw new NotFoundError('Image import job not found or not cancellable')
  }
  return rows[0]
}

export function buildImageImportFailureCsv(failures) {
  const lines = ['sku,file,reason']
  for (const failure of failures || []) {
    lines.push(
      [
        escapeCsvField(failure.sku),
        escapeCsvField(failure.file || failure.fileName),
        escapeCsvField(failure.reason),
      ].join(',')
    )
  }
  return `${lines.join('\n')}\n`
}

export function assertSafeImageUrl(urlString) {
  return assertPublicHttpUrl(urlString, { label: 'Image URL' })
}

export function validateFetchResponseUrl(urlString) {
  return assertSafeImageUrl(urlString)
}

function readZipEntryBuffer(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) return reject(err)
      readStream.on('error', reject)
      readStreamToBuffer(
        readStream,
        Math.min(entry.uncompressedSize, config.IMPORT_IMAGE_MAX_BYTES)
      )
        .then(resolve)
        .catch(reject)
    })
  })
}

async function readStreamToBuffer(readStream, maxBytes) {
  const chunks = []
  let total = 0
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      readStream.destroy()
      reject(new ValidationError('ZIP entry extraction exceeded the time limit'))
    }, ZIP_MAX_PROCESSING_MS)
    readStream.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        readStream.destroy()
        clearTimeout(timeout)
        reject(new ValidationError(`Image exceeds maximum size of ${maxBytes} bytes`))
        return
      }
      chunks.push(chunk)
    })
    readStream.on('end', () => {
      clearTimeout(timeout)
      resolve(Buffer.concat(chunks))
    })
    readStream.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

function buildZipEntryIndex(zipfile) {
  return new Promise((resolve, reject) => {
    const byKey = new Map()
    const limits = createZipLimitState()
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      zipfile.close()
      reject(error)
    }
    zipfile.on('entry', (entry) => {
      try {
        assertZipEntryWithinLimits(limits, entry)
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry()
          return
        }
        if (!isSafeZipEntryPath(entry.fileName) || !isAllowedImageFilename(entry.fileName)) {
          zipfile.readEntry()
          return
        }
        const lower = entry.fileName.toLowerCase()
        const base = path.basename(lower)
        if (!byKey.has(lower)) byKey.set(lower, entry)
        if (!byKey.has(base)) byKey.set(base, entry)
        zipfile.readEntry()
      } catch (error) {
        fail(error)
      }
    })
    zipfile.on('end', () => {
      if (settled) return
      settled = true
      resolve(byKey)
    })
    zipfile.on('error', fail)
    zipfile.readEntry()
  })
}

function lookupZipEntry(entryIndex, fileName) {
  const lower = String(fileName || '').toLowerCase()
  return entryIndex.get(lower) || entryIndex.get(path.basename(lower)) || null
}

async function uploadOptimizedProductImages({ supplierId, productId, fileName, buffer }) {
  const lowerName = String(fileName || '').toLowerCase()
  const sourceMime =
    lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')
      ? 'image/jpeg'
      : lowerName.endsWith('.png')
        ? 'image/png'
        : 'image/webp'
  const scan = await scanBuffer(buffer, { maxBytes: config.IMPORT_IMAGE_MAX_BYTES })
  if (scan.status === 'infected') {
    throw new ValidationError('Image failed security scanning')
  }
  if (scan.status !== 'clean') {
    throw new ValidationError('Image security scanning is unavailable')
  }
  assertUploadFileBytes(buffer, sourceMime)
  const optimized = await optimizeProductImage(buffer, fileName)
  const mainKey = `uploads/${supplierId}/products/${productId}/main.webp`
  const thumbKey = `uploads/${supplierId}/products/${productId}/thumb.webp`
  const totalBytes = optimized.mainBuffer.length + optimized.thumbBuffer.length

  const metered = await ensureStorageForUpload(supplierId, 'SUPPLIER', totalBytes)
  if (!metered.allowed) {
    throw new ValidationError(`Storage limit reached (${metered.current}/${metered.limit} MB)`)
  }

  await putObject({
    fileKey: mainKey,
    body: optimized.mainBuffer,
    contentType: optimized.mainContentType,
  })
  await putObject({
    fileKey: thumbKey,
    body: optimized.thumbBuffer,
    contentType: optimized.thumbContentType,
  })

  return {
    imageUrl: buildObjectPublicUrl(mainKey),
    imageThumbUrl: buildObjectPublicUrl(thumbKey),
    bytesUploaded: totalBytes,
  }
}

export async function importImageFromUrl({ url, supplierId, productId }) {
  assertSafeImageUrl(url)

  try {
    const response = await fetchPinnedPublic(url, {
      timeoutMs: URL_FETCH_TIMEOUT_MS,
      maxResponseBytes: config.IMPORT_IMAGE_MAX_BYTES,
      headers: { Accept: 'image/*' },
      label: 'Image URL',
    })

    if (response.status >= 300 && response.status < 400) {
      throw new ValidationError('URL redirects are not allowed')
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ValidationError(`Failed to fetch image (${response.status})`)
    }

    validateFetchResponseUrl(response.url || url)

    const contentType = response.headers['content-type'] || ''
    if (contentType && !contentType.startsWith('image/')) {
      throw new ValidationError('URL did not return an image')
    }

    if (response.body.length > config.IMPORT_IMAGE_MAX_BYTES) {
      throw new ValidationError(
        `Image exceeds maximum size of ${config.IMPORT_IMAGE_MAX_BYTES} bytes`
      )
    }

    let fileName = 'image.jpg'
    try {
      const parsed = new URL(url)
      const base = path.basename(parsed.pathname)
      if (base && isAllowedImageFilename(base)) {
        fileName = base
      }
    } catch {
      // keep default
    }

    const buffer = response.body
    const uploaded = await uploadOptimizedProductImages({
      supplierId,
      productId,
      fileName,
      buffer,
    })

    await query(
      `
        UPDATE product
        SET image_url = $1, image_thumb_url = $2, updated_at = now()
        WHERE id = $3 AND supplier_id = $4
      `,
      [uploaded.imageUrl, uploaded.imageThumbUrl, productId, supplierId]
    )

    return uploaded
  } catch (err) {
    if (err?.code === 'OUTBOUND_FETCH_TIMEOUT') {
      throw new ValidationError('Image fetch timed out')
    }
    if (err?.code === 'OUTBOUND_FETCH_BLOCKED') {
      throw new ValidationError('Image URL must resolve to a public address')
    }
    throw err
  }
}

function createZipLimitState() {
  return { entries: 0, uncompressedBytes: 0, startedAt: Date.now() }
}

function assertZipEntryWithinLimits(state, entry) {
  state.entries += 1
  const size = Number(entry.uncompressedSize)
  const normalized = String(entry.fileName || '').replace(/\\/g, '/')
  const depth = normalized.split('/').filter(Boolean).length
  if (state.entries > ZIP_MAX_ENTRIES) {
    throw new ValidationError(`ZIP contains more than ${ZIP_MAX_ENTRIES} entries`)
  }
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new ValidationError('ZIP entry has an invalid uncompressed size')
  }
  if (size > ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new ValidationError(
      `ZIP entry exceeds the ${ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES} byte per-entry limit`
    )
  }
  state.uncompressedBytes += size
  if (state.uncompressedBytes > ZIP_MAX_UNCOMPRESSED_BYTES) {
    throw new ValidationError('ZIP uncompressed content exceeds the safety limit')
  }
  if (depth > ZIP_MAX_PATH_DEPTH) {
    throw new ValidationError(`ZIP entry nesting exceeds ${ZIP_MAX_PATH_DEPTH} levels`)
  }
  if (normalized.length > 1024) {
    throw new ValidationError('ZIP entry path is too long')
  }
  if (Date.now() - state.startedAt > ZIP_MAX_PROCESSING_MS) {
    throw new ValidationError('ZIP inspection exceeded the time limit')
  }
}

async function getJobById(jobId) {
  const { rows } = await query(`SELECT * FROM catalog_image_import_job WHERE id = $1`, [jobId])
  return rows[0] || null
}

async function isJobCancelled(jobId) {
  const job = await getJobById(jobId)
  return job?.status === 'cancelled'
}

async function updateJobProgress(jobId, patch) {
  await query(
    `
      UPDATE catalog_image_import_job
      SET
        processed = COALESCE($2, processed),
        matched = COALESCE($3, matched),
        failed = COALESCE($4, failed),
        skipped = COALESCE($5, skipped),
        result_json = COALESCE($6, result_json),
        status = COALESCE($7, status),
        error_message = COALESCE($8, error_message),
        started_at = COALESCE($9, started_at),
        completed_at = COALESCE($10, completed_at)
      WHERE id = $1
    `,
    [
      jobId,
      patch.processed ?? null,
      patch.matched ?? null,
      patch.failed ?? null,
      patch.skipped ?? null,
      patch.resultJson != null ? JSON.stringify(patch.resultJson) : null,
      patch.status ?? null,
      patch.errorMessage ?? null,
      patch.startedAt ?? null,
      patch.completedAt ?? null,
    ]
  )
}

export async function processImageImportJob(jobId) {
  const job = await getJobById(jobId)
  if (!job) {
    throw new NotFoundError('Image import job not found')
  }
  if (!['pending', 'processing'].includes(job.status)) {
    return job
  }

  if (
    !(await isTenantUnlockedForBackgroundWrites({
      tenantId: job.supplier_id,
      tenantType: 'SUPPLIER',
    }))
  ) {
    const error = new ConflictError('Supplier account is locked; image import was not processed.')
    await updateJobProgress(jobId, {
      status: 'failed',
      errorMessage: error.message,
      completedAt: new Date().toISOString(),
    })
    throw error
  }

  await updateJobProgress(jobId, {
    status: 'processing',
    startedAt: job.started_at || new Date().toISOString(),
  })

  const preview = job.preview_json || {}
  const matches = preview.allMatches || preview.matches || []
  const failures = []
  let processed = 0
  let matched = 0
  let failed = 0
  let skipped = preview.summary?.skippedExisting || 0

  let zipPath
  let tempZip = false
  let zipfile

  try {
    zipPath = await resolveZipPathFromStorage(job.source_file_key)
    tempZip = true
    zipfile = await openZip(zipPath)
    const entryIndex = await buildZipEntryIndex(zipfile)

    for (let offset = 0; offset < matches.length; offset += BATCH_SIZE) {
      if (
        !(await isTenantUnlockedForBackgroundWrites({
          tenantId: job.supplier_id,
          tenantType: 'SUPPLIER',
        }))
      ) {
        throw new ConflictError('Supplier account is locked; image import was not processed.')
      }

      if (await isJobCancelled(jobId)) {
        await updateJobProgress(jobId, {
          status: 'cancelled',
          processed,
          matched,
          failed,
          skipped,
          resultJson: { failures },
          completedAt: new Date().toISOString(),
        })
        return await getJobById(jobId)
      }

      const batch = matches.slice(offset, offset + BATCH_SIZE)

      await withTransaction(async (client) => {
        for (const match of batch) {
          processed += 1
          try {
            const entry = lookupZipEntry(entryIndex, match.fileName)
            if (!entry) {
              failed += 1
              failures.push({
                sku: match.sku,
                file: match.fileName,
                reason: 'File not found in ZIP',
              })
              continue
            }

            if (entry.uncompressedSize > config.IMPORT_IMAGE_MAX_BYTES) {
              failed += 1
              failures.push({
                sku: match.sku,
                file: match.fileName,
                reason: `Image exceeds maximum size of ${config.IMPORT_IMAGE_MAX_BYTES} bytes`,
              })
              continue
            }

            const buffer = await readZipEntryBuffer(zipfile, entry)
            const uploaded = await uploadOptimizedProductImages({
              supplierId: job.supplier_id,
              productId: match.productId,
              fileName: match.fileName,
              buffer,
            })

            await client.query(
              `
                UPDATE product
                SET image_url = $1, image_thumb_url = $2, updated_at = now()
                WHERE id = $3 AND supplier_id = $4
              `,
              [uploaded.imageUrl, uploaded.imageThumbUrl, match.productId, job.supplier_id]
            )

            matched += 1
          } catch (err) {
            failed += 1
            failures.push({
              sku: match.sku,
              file: match.fileName,
              reason: err?.message || 'Import failed',
            })
          }
        }
      })

      await updateJobProgress(jobId, {
        processed,
        matched,
        failed,
        skipped,
        resultJson: { failures },
      })
    }

    if (job.source_file_key) {
      await deleteObject(job.source_file_key).catch((err) => {
        logger.warn({
          event: 'image_import.zip_delete_failed',
          jobId,
          fileKey: job.source_file_key,
          error: err.message,
        })
      })
    }

    await updateJobProgress(jobId, {
      status: 'completed',
      processed,
      matched,
      failed,
      skipped,
      resultJson: { failures },
      completedAt: new Date().toISOString(),
    })

    const completedAt = new Date()
    const startedAt = job.started_at ? new Date(job.started_at) : completedAt
    await writeSystemAuditLog({
      action_type: 'catalog.image_import.completed',
      actor_user_id: job.created_by_user_id,
      tenant_type: 'SUPPLIER',
      tenant_id: job.supplier_id,
      target_id: jobId,
      payload_json: {
        resource_type: 'catalog_image_import',
        method: job.method,
        matched,
        failed,
        skipped,
        processed,
        replaceExisting: job.replace_existing,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    })
  } catch (err) {
    logger.error({ event: 'image_import.job_failed', jobId, error: err.message })
    await updateJobProgress(jobId, {
      status: 'failed',
      processed,
      matched,
      failed,
      skipped,
      resultJson: { failures },
      errorMessage: err.message,
      completedAt: new Date().toISOString(),
    })
    throw err
  } finally {
    if (zipfile) {
      try {
        zipfile.close()
      } catch {
        // ignore
      }
    }
    if (tempZip && zipPath) {
      await fs.unlink(zipPath).catch(() => {})
    }
  }

  return await getJobById(jobId)
}
