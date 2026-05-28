import express from 'express'
import { requireAuth, requireRole, resolveTenantContext } from '../lib/rbac.js'
import { filesUploadGuard } from '../lib/route-permissions.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/env.js'
import { meterStorageFromRequest } from '../lib/storage-upload.js'
import { sanitizeUploadFileName, assertUploadKeyOwnedByUser } from '../lib/sanitize-upload.js'
import { createPresignedUpload, buildObjectPublicUrl } from '../lib/object-storage.js'

const router = express.Router()

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
      } catch {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid file name',
          },
          requestId: req.requestId,
        })
      }

      const sizeBytes = fileSize ? Number(fileSize) : 0
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
        fileType,
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
            ? `Storage bucket "${config.S3_BUCKET}" is missing. Run MinIO init or set S3_BUCKET.`
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
      const fileUrl = buildObjectPublicUrl(config.S3_BUCKET, fileKey)

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
