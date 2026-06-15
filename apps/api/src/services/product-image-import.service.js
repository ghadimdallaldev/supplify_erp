import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import yauzl from 'yauzl'
import { query, withTransaction } from '../lib/db.js'
import { config } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { ensureStorageForUpload } from '../lib/subscription.js'
import { writeSystemAuditLog } from '../lib/audit.js'
import {
  putObject,
  deleteObject,
  buildObjectPublicUrl,
  getObjectStream,
} from './storage/storage.service.js'
import {
  optimizeProductImage,
  isAllowedImageFilename,
  isSafeZipEntryPath,
} from './image-optimization.service.js'
import { escapeCsvField } from '../lib/sanitize-upload.js'

const PREVIEW_ROW_CAP = 200
const BATCH_SIZE = 50
const URL_FETCH_TIMEOUT_MS = 15_000

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
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err)

      zipfile.on('entry', (entry) => {
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
      })
      zipfile.on('end', () => resolve(entries))
      zipfile.on('error', reject)
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
  const { body } = await getObjectStream(fileKey)
  return Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '')
}

async function resolveZipPathFromStorage(fileKey) {
  const normalizedKey = String(fileKey || '').replace(/^\/+/, '')
  if (!normalizedKey || normalizedKey.includes('..')) {
    throw new ValidationError('Invalid ZIP file key')
  }

  if (config.STORAGE_DRIVER === 'local') {
    return path.join(path.resolve(config.STORAGE_LOCAL_PATH), normalizedKey)
  }

  const tmpPath = path.join(os.tmpdir(), `supplify-import-${randomUUID()}.zip`)
  const { body } = await getObjectStream(normalizedKey)
  await fs.writeFile(tmpPath, body)
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
    tempZip = config.STORAGE_DRIVER !== 'local'
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

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return true
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split('.').map(Number)
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 0) return true
  }

  return false
}

export function assertSafeImageUrl(urlString) {
  let parsed
  try {
    parsed = new URL(urlString)
  } catch {
    throw new ValidationError('Invalid image URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ValidationError('Only HTTP and HTTPS URLs are allowed')
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new ValidationError('Private or local URLs are not allowed')
  }
  return parsed
}

export function validateFetchResponseUrl(urlString) {
  return assertSafeImageUrl(urlString)
}

function readZipEntryBuffer(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) return reject(err)
      readStream.on('error', reject)
      readStreamToBuffer(readStream, entry.uncompressedSize).then(resolve).catch(reject)
    })
  })
}

async function readStreamToBuffer(readStream, maxBytes) {
  const chunks = []
  let total = 0
  return new Promise((resolve, reject) => {
    readStream.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        readStream.destroy()
        reject(new ValidationError(`Image exceeds maximum size of ${maxBytes} bytes`))
        return
      }
      chunks.push(chunk)
    })
    readStream.on('end', () => resolve(Buffer.concat(chunks)))
    readStream.on('error', reject)
  })
}

function buildZipEntryIndex(zipfile) {
  return new Promise((resolve, reject) => {
    const byKey = new Map()
    zipfile.on('entry', (entry) => {
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
    })
    zipfile.on('end', () => resolve(byKey))
    zipfile.on('error', reject)
    zipfile.readEntry()
  })
}

function lookupZipEntry(entryIndex, fileName) {
  const lower = String(fileName || '').toLowerCase()
  return entryIndex.get(lower) || entryIndex.get(path.basename(lower)) || null
}

async function uploadOptimizedProductImages({ supplierId, productId, fileName, buffer }) {
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

export async function importImageFromUrl({ url, supplierId, productId, userId: _userId }) {
  assertSafeImageUrl(url)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { Accept: 'image/*' },
    })

    if (response.status >= 300 && response.status < 400) {
      throw new ValidationError('URL redirects are not allowed')
    }

    if (!response.ok) {
      throw new ValidationError(`Failed to fetch image (${response.status})`)
    }

    validateFetchResponseUrl(response.url || url)

    const contentType = response.headers.get('content-type') || ''
    if (contentType && !contentType.startsWith('image/')) {
      throw new ValidationError('URL did not return an image')
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > config.IMPORT_IMAGE_MAX_BYTES) {
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

    const buffer = Buffer.from(arrayBuffer)
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
    if (err?.name === 'AbortError') {
      throw new ValidationError('Image fetch timed out')
    }
    throw err
  } finally {
    clearTimeout(timeout)
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
    tempZip = config.STORAGE_DRIVER !== 'local'
    zipfile = await openZip(zipPath)
    const entryIndex = await buildZipEntryIndex(zipfile)

    for (let offset = 0; offset < matches.length; offset += BATCH_SIZE) {
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
