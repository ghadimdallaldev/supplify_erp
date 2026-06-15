import express from 'express'
import { requireAuth, requireRole, resolveTenantContext, optionalAuth } from '../lib/rbac.js'
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
  assertUploadKeyOwnedByUser,
  assertFileExtensionMatchesMime,
  MAX_UPLOAD_BYTES,
  MAX_IMPORT_ZIP_BYTES,
} from '../lib/sanitize-upload.js'
import {
  createPresignedUpload,
  buildObjectPublicUrl,
  getStorageDriver,
  getStorageProvider,
  getObjectStream,
} from '../services/storage/storage.service.js'

const router = express.Router()

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

    const { body, contentType, contentLength } = await getObjectStream(key)
    if (contentType) res.setHeader('Content-Type', contentType)
    if (contentLength != null) res.setHeader('Content-Length', String(contentLength))
    res.setHeader('Cache-Control', 'public, max-age=86400')

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
    logger.warn('File object serve error', { message: error?.message })
    return res.status(notFound ? 404 : 500).json({
      ok: false,
      data: null,
      error: {
        name: notFound ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: notFound ? 'File not found' : 'Failed to load file',
      },
      requestId: req.requestId,
    })
  }
})

// Complete PUT upload using signed token from /presign (local disk or private S3 via API)
async function handleTokenUpload(req, res) {
  setObjectCorsHeaders(req, res)
  try {
    const contentType = req.headers['content-type'] || 'application/octet-stream'
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')
    const provider = getStorageProvider()
    if (!provider.completeUpload) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Direct upload not available for this storage driver',
        },
        requestId: req.requestId,
      })
    }
    await provider.completeUpload(req.params.token, body, contentType)
    res.status(204).end()
  } catch (error) {
    const invalid =
      error?.name === 'UPLOAD_TOKEN_INVALID' ||
      error?.name === 'UPLOAD_CONTENT_TYPE' ||
      error?.name === 'UPLOAD_KEY_INVALID' ||
      error?.name === 'UPLOAD_TOO_LARGE'
    res.status(invalid ? 400 : 500).json({
      ok: false,
      data: null,
      error: {
        name: invalid ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message: error?.message || 'Upload failed',
      },
      requestId: req.requestId,
    })
  }
}

router.put('/upload/:token', express.raw({ type: '*/*', limit: '10mb' }), handleTokenUpload)

/** Large import archives (ZIP) — token maxBytes enforced in completeUpload. */
router.put(
  '/upload-import/:token',
  express.raw({ type: '*/*', limit: MAX_IMPORT_ZIP_BYTES }),
  handleTokenUpload
)

// Generate presigned URL for file upload
router.post(
  '/presign',
  requireAuth,
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
      if (fileSize && fileSize > 10 * 1024 * 1024) {
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
      const { presignedUrl, publicUrl, bucket } = await createPresignedUpload({
        fileKey,
        fileSize: sizeBytes > 0 ? sizeBytes : MAX_UPLOAD_BYTES,
        fileType,
        userId: req.userData.id,
      })

      logger.info('Presigned URL generated', {
        fileName,
        fileType,
        bucket,
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
          bucket,
          storageMetered: sizeBytes > 0,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Generate presigned URL error:', error)
      const isBucket =
        error?.name === 'NoSuchBucket' ||
        error?.Code === 'NoSuchBucket' ||
        /bucket/i.test(error?.message || '')
      res.status(isBucket ? 503 : 500).json({
        ok: false,
        data: null,
        error: {
          name: isBucket ? 'STORAGE_UNAVAILABLE' : 'INTERNAL_ERROR',
          message: isBucket
            ? `Storage bucket "${config.STORAGE_BUCKET}" is missing. Check STORAGE_* settings or run storage init.`
            : 'Failed to generate presigned URL',
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

      try {
        assertUploadKeyOwnedByUser(fileKey, req.userData.id)
      } catch {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid file key',
          },
          requestId: req.requestId,
        })
      }

      const { rows: products } = await query(
        `
        SELECT p.*, s.id as supplier_id, s.contact_email
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

      if (req.userData.role === 'SUPPLIER' && products[0].contact_email !== req.userData.email) {
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
