import express from 'express'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireAuth, requireRole, getRequestTenant } from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { config } from '../config/env.js'
import { checkLimit } from '../lib/subscription.js'
import { incrementStorageUsage } from '../lib/subscription.js'

const router = express.Router()

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
  forcePathStyle: true,
})

// Generate presigned URL for file upload
router.post(
  '/presign',
  requireAuth,
  requireRole(['SUPPLIER', 'RESTAURANT', 'ADMIN']),
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

      // Enforce plan storage_mb limit (require fileSize for limit check)
      const sizeBytes = fileSize ? Number(fileSize) : 0
      if (sizeBytes > 0 && req.userData.role !== 'ADMIN') {
        const tenant = await getRequestTenant(req)
        if (tenant) {
          const storageCheck = await checkLimit(tenant.tenantId, tenant.tenantType, 'storage_mb')
          const sizeMb = Math.ceil(sizeBytes / (1024 * 1024))
          if (
            !storageCheck.isUnlimited &&
            storageCheck.limit != null &&
            storageCheck.current + sizeMb > storageCheck.limit
          ) {
            return res.status(403).json({
              ok: false,
              data: null,
              error: {
                name: 'STORAGE_LIMIT_REACHED',
                message: `Upload would exceed your storage limit (${storageCheck.current}/${storageCheck.limit} MB used). Upgrade your plan for more storage.`,
                limit: storageCheck.limit,
                current: storageCheck.current,
              },
              requestId: req.requestId,
            })
          }
        }
      }

      // Generate unique file key
      const fileKey = `uploads/${req.userData.id}/${Date.now()}-${fileName}`

      const command = new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: fileKey,
        ContentType: fileType,
      })
      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 })

      logger.info('Presigned URL generated', {
        fileName,
        fileType,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: {
          presignedUrl,
          fileKey,
          fileName,
          fileType,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Generate presigned URL error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to generate presigned URL',
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

      // Resolve product and supplier for ownership and storage tracking
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

      // Generate file URL
      const fileUrl = `${config.S3_ENDPOINT}/${config.S3_BUCKET}/${fileKey}`

      // Create attachment record (file_size_bytes for storage quota; column added in 0040)
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

      if (supplierId && sizeBytes > 0) {
        await incrementStorageUsage(supplierId, 'SUPPLIER', sizeBytes)
      }

      // Update product image URL if it's an image
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
