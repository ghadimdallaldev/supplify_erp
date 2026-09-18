import express from 'express'
import rateLimit from 'express-rate-limit'
import { createHash } from 'node:crypto'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  optionalAuth,
  getSupplierIdForRequest,
  getRequestTenant,
} from '../lib/rbac.js'
import { verifyObjectAccess } from '../lib/object-download-auth.js'
import { filesUploadGuard } from '../lib/route-permissions.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/env.js'

function setObjectCorsHeaders(req, res) {
  const origin = req.headers.origin
  if (origin && config.WEB_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}
import { meterStorageFromRequest } from '../lib/storage-upload.js'
import {
  sanitizeUploadFileName,
  assertFileExtensionMatchesMime,
  MAX_UPLOAD_BYTES,
  MAX_IMPORT_ZIP_BYTES,
} from '../lib/sanitize-upload.js'
import {
  createPresignedUpload,
  buildObjectPublicUrl,
  getObjectStream,
} from '../services/storage/storage.service.js'
import {
  completeUploadSession,
  assertCleanUploadOwnership,
  ensureObjectCleanForRead,
} from '../services/storage/upload-security.service.js'
import { createRateLimitStore } from '../lib/rate-limit-store.js'

const router = express.Router()

function uploadRateKey(req) {
  const session = req.params?.token
    ? createHash('sha256').update(String(req.params.token)).digest('hex').slice(0, 16)
    : 'presign'
  return [
    req.userData?.id || 'anonymous',
    req.tenantContext?.tenantId || 'no-tenant',
    session,
    req.ip,
  ].join(':')
}

function createUploadLimiter(prefix, max) {
  if (!config.RATE_LIMIT_ENABLED) return (_req, _res, next) => next()
  const store = createRateLimitStore(prefix)
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: uploadRateKey,
    ...(store ? { store } : {}),
  })
}

const uploadTransferLimiter = createUploadLimiter('rl:file-upload', 30)
const uploadPresignLimiter = createUploadLimiter('rl:file-presign', 60)

/** Serve uploaded objects when buckets are private (Railway, R2 without public URL). */
router.get('/object', optionalAuth, async (req, res) => {
  setObjectCorsHeaders(req, res)
  try {
    const rawKey = req.query.key
    if (!rawKey || typeof rawKey !== 'string') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'key query parameter is required' },
        requestId: req.requestId,
      })
    }
    const key = rawKey.replace(/^\/+/, '')
    if (key.includes('..') || !key.startsWith('uploads/')) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid file key' },
        requestId: req.requestId,
      })
    }

    const allowed = await verifyObjectAccess(key, req)
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Access denied' },
        requestId: req.requestId,
      })
    }

    const object = await getObjectStream(key)
    const cleanObject = await ensureObjectCleanForRead(key, object)
    const { body, contentType, contentLength } = cleanObject
    if (contentType) res.setHeader('Content-Type', contentType)
    if (contentLength != null) res.setHeader('Content-Length', String(contentLength))
    res.setHeader('Cache-Control', 'private, no-store')

    if (body && typeof body.pipe === 'function') {
      body.pipe(res)
      return
    }
    if (Buffer.isBuffer(body)) {
      return res.send(body)
    }
    if (body instanceof Uint8Array) {
      return res.send(Buffer.from(body))
    }
    return res.status(404).end()
  } catch (error) {
    const notFound =
      error?.name === 'NoSuchKey' ||
      error?.Code === 'NoSuchKey' ||
      error?.name === 'UPLOAD_KEY_INVALID'
    const scanUnavailable = error?.name === 'MALWARE_SCAN_UNAVAILABLE'
    const infected = error?.name === 'UPLOAD_MALWARE_DETECTED'
    logger.warn('File object serve error', { error: error?.name || 'FILE_READ_FAILED' })
    return res.status(notFound ? 404 : scanUnavailable ? 503 : infected ? 422 : 500).json({
      ok: false,
      data: null,
      error: {
        name: notFound
          ? 'NOT_FOUND'
          : scanUnavailable
            ? 'MALWARE_SCAN_UNAVAILABLE'
            : infected
              ? 'UPLOAD_MALWARE_DETECTED'
              : 'INTERNAL_ERROR',
        message: notFound
          ? 'File not found'
          : scanUnavailable
            ? 'File security scanning is temporarily unavailable'
            : infected
              ? 'File failed security scanning'
              : 'Failed to load file',
      },
      requestId: req.requestId,
    })
  }
})

// Complete PUT upload using signed token from /presign (local disk or private S3 via API)
async function handleTokenUpload(req, res) {
  setObjectCorsHeaders(req, res)
  const contentType = req.headers['content-type'] || 'application/octet-stream'
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')
  try {
    const tenant = await getRequestTenant(req)
    await completeUploadSession({
      token: req.params.token,
      userId: req.userData.id,
      tenantId: tenant?.tenantId || null,
      tenantType: tenant?.tenantType || null,
      body,
      contentType,
    })
    res.status(204).end()
  } catch (error) {
    const invalid =
      error?.name === 'UPLOAD_TOKEN_INVALID' ||
      error?.name === 'UPLOAD_CONTENT_TYPE' ||
      error?.name === 'UPLOAD_KEY_INVALID' ||
      error?.name === 'UPLOAD_TOO_LARGE' ||
      error?.name === 'UPLOAD_INVALID_IMAGE' ||
      error?.name === 'UPLOAD_INVALID_FILE' ||
      error?.name === 'UPLOAD_REPLAY_CONFLICT'
    const forbidden = error?.name === 'UPLOAD_SESSION_FORBIDDEN'
    const unavailable = error?.name === 'MALWARE_SCAN_UNAVAILABLE'
    const infected = error?.name === 'UPLOAD_MALWARE_DETECTED'
    const status = forbidden ? 403 : unavailable ? 503 : infected ? 422 : invalid ? 400 : 500
    logger.warn({
      event: 'storage.upload.failed',
      requestId: req.requestId,
      status,
      contentType,
      bytes: body.length,
      error: error?.name || 'UPLOAD_FAILED',
    })
    res.status(status).json({
      ok: false,
      data: null,
      error: {
        name: forbidden
          ? 'FORBIDDEN'
          : unavailable
            ? 'MALWARE_SCAN_UNAVAILABLE'
            : infected
              ? 'UPLOAD_MALWARE_DETECTED'
              : invalid
                ? 'VALIDATION_ERROR'
                : 'INTERNAL_ERROR',
        message: unavailable
          ? 'Upload security scanning is temporarily unavailable'
          : infected
            ? 'Upload failed security scanning'
            : error?.message || 'Upload failed',
      },
      requestId: req.requestId,
    })
  }
}

router.put(
  '/upload/:token',
  requireAuth,
  uploadTransferLimiter,
  express.raw({ type: '*/*', limit: MAX_UPLOAD_BYTES }),
  handleTokenUpload
)

/** Large import archives (ZIP) — token maxBytes enforced in completeUpload. */
router.put(
  '/upload-import/:token',
  requireAuth,
  uploadTransferLimiter,
  express.raw({ type: '*/*', limit: MAX_IMPORT_ZIP_BYTES }),
  handleTokenUpload
)

// Generate presigned URL for file upload
router.post(
  '/presign',
  requireAuth,
  uploadPresignLimiter,
  requireRole(['SUPPLIER', 'RESTAURANT', 'ADMIN']),
  resolveTenantContext,
  filesUploadGuard,
  async (req, res) => {
    try {
      const { fileName, fileType, fileSize } = req.body

      if (!fileName || !fileType) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'fileName and fileType are required',
          },
          requestId: req.requestId,
        })
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'File type not allowed',
          },
          requestId: req.requestId,
        })
      }

      // Validate file size (10MB max)
      if (
        fileSize != null &&
        (!Number.isSafeInteger(Number(fileSize)) || Number(fileSize) > MAX_UPLOAD_BYTES)
      ) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'File size too large (max 10MB)',
          },
          requestId: req.requestId,
        })
      }

      let safeFileName
      try {
        safeFileName = sanitizeUploadFileName(fileName)
        assertFileExtensionMatchesMime(safeFileName, fileType)
      } catch (err) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: err?.message || 'Invalid file name',
          },
          requestId: req.requestId,
        })
      }

      const sizeBytes = fileSize ? Number(fileSize) : 0
      if (sizeBytes > MAX_UPLOAD_BYTES) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'File size too large (max 10MB)',
          },
          requestId: req.requestId,
        })
      }
      const storageMeter = await meterStorageFromRequest(req, sizeBytes)
      if (!storageMeter.ok) {
        return res.status(storageMeter.status).json({
          ok: false,
          data: null,
          error: storageMeter.error,
          requestId: req.requestId,
        })
      }

      const fileKey = `uploads/${req.userData.id}/${Date.now()}-${safeFileName}`
      const tenant = await getRequestTenant(req)
      const { presignedUrl, publicUrl } = await createPresignedUpload({
        fileKey,
        fileSize: sizeBytes > 0 ? sizeBytes : MAX_UPLOAD_BYTES,
        fileType,
        userId: req.userData.id,
        tenantId: tenant?.tenantId || null,
        tenantType: tenant?.tenantType || null,
      })

      logger.info('Presigned URL generated', {
        fileName,
        fileType,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: {
          presignedUrl,
          url: presignedUrl,
          publicUrl,
          fileKey,
          fileName,
          fileType,
          storageMetered: sizeBytes > 0,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Generate presigned URL error:', error)
      const isStorageUnavailable =
        error?.name === 'NoSuchBucket' ||
        error?.Code === 'NoSuchBucket' ||
        error?.name === 'STORAGE_UNAVAILABLE'
      res.status(isStorageUnavailable ? 503 : 500).json({
        ok: false,
        data: null,
        error: {
          name: isStorageUnavailable ? 'STORAGE_UNAVAILABLE' : 'INTERNAL_ERROR',
          message: isStorageUnavailable
            ? 'File storage is temporarily unavailable'
            : 'Failed to generate upload session',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Attach file to product
router.post(
  '/product/:productId/attach',
  requireAuth,
  requireRole(['SUPPLIER', 'ADMIN']),
  resolveTenantContext,
  filesUploadGuard,
  async (req, res) => {
    try {
      const { productId } = req.params
      const { fileKey, fileName, fileType, fileSize } = req.body

      if (!fileKey || !fileName) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'fileKey and fileName are required',
          },
          requestId: req.requestId,
        })
      }

      const tenant = await getRequestTenant(req)
      await assertCleanUploadOwnership(fileKey, {
        userId: req.userData.id,
        tenantId: tenant?.tenantId || null,
        tenantType: tenant?.tenantType || null,
      })

      const { rows: products } = await query(
        `
        SELECT p.*, s.id as supplier_id
        FROM product p
        JOIN supplier s ON s.id = p.supplier_id
        WHERE p.id = $1
      `,
        [productId]
      )

      if (products.length === 0) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Product not found',
          },
          requestId: req.requestId,
        })
      }

      if (req.userData.role === 'SUPPLIER') {
        const ownSupplierId = await getSupplierIdForRequest(req)
        if (!ownSupplierId || products[0].supplier_id !== ownSupplierId) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'Access denied. You can only attach files to your own products',
            },
            requestId: req.requestId,
          })
        }
      }

      const supplierId = products[0].supplier_id
      const sizeBytes = fileSize != null ? Math.max(0, parseInt(String(fileSize), 10) || 0) : 0
      const fileUrl = buildObjectPublicUrl(fileKey)

      const { rows } = await query(
        `
      INSERT INTO attachment (owner_type, owner_id, url, type, meta, file_size_bytes)
      VALUES ('PRODUCT', $1, $2, $3, $4, $5)
      RETURNING *
    `,
        [
          productId,
          fileUrl,
          fileType || 'application/octet-stream',
          JSON.stringify({ fileName, uploadedBy: req.userData.id }),
          sizeBytes,
        ]
      )

      if (supplierId && sizeBytes > 0 && !req.body.storageMeteredAtPresign) {
        const { ensureStorageForUpload } = await import('../lib/subscription.js')
        const metered = await ensureStorageForUpload(supplierId, 'SUPPLIER', sizeBytes)
        if (!metered.allowed) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'LIMIT_EXCEEDED',
              message: `Storage limit reached (${metered.current}/${metered.limit} MB).`,
            },
            requestId: req.requestId,
          })
        }
      }

      if (fileType && fileType.startsWith('image/')) {
        await query(
          `
        UPDATE product 
        SET image_url = $1, updated_at = now()
        WHERE id = $2
      `,
          [fileUrl, productId]
        )
      }

      logger.info('File attached to product', {
        productId,
        fileName,
        fileUrl,
        actor: req.userData.id,
      })

      res.status(201).json({
        ok: true,
        data: { attachment: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Attach file error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to attach file',
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as filesRoutes }
