import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { logger } from '../../lib/logger.js'
import { createUploadToken, verifyUploadToken } from './upload-token.js'
import { MAX_UPLOAD_BYTES } from '../../lib/sanitize-upload.js'

function createS3Client(cfg, endpoint) {
  const forcePathStyle = cfg.STORAGE_S3_FORCE_PATH_STYLE !== false
  return new S3Client({
    endpoint,
    region: cfg.STORAGE_REGION || 'auto',
    credentials: {
      accessKeyId: cfg.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: cfg.STORAGE_SECRET_ACCESS_KEY,
    },
    forcePathStyle,
  })
}

/**
 * @param {import('../../config/env.js').config} cfg
 */
export function createS3CompatibleProvider(cfg) {
  /** @type {S3Client | null} */
  let internalClient = null
  /** @type {S3Client | null} */
  let presignClient = null

  function getInternalClient() {
    if (!internalClient) {
      internalClient = createS3Client(cfg, cfg.STORAGE_ENDPOINT)
    }
    return internalClient
  }

  function getPresignClient() {
    // Private buckets (e.g. Railway): presign against the S3 API endpoint, not the browser proxy base.
    const presignEndpoint =
      cfg.STORAGE_PUBLIC_READ === false
        ? cfg.STORAGE_ENDPOINT
        : cfg.STORAGE_PUBLIC_URL || cfg.STORAGE_ENDPOINT
    if (presignEndpoint === cfg.STORAGE_ENDPOINT) {
      return getInternalClient()
    }
    if (!presignClient) {
      presignClient = createS3Client(cfg, presignEndpoint)
    }
    return presignClient
  }

  function getConfiguredBuckets() {
    const raw = cfg.STORAGE_BUCKETS || cfg.STORAGE_BUCKET || 'supplify'
    const names = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const unique = [...new Set(names)]
    if (!unique.includes(cfg.STORAGE_BUCKET)) {
      unique.unshift(cfg.STORAGE_BUCKET)
    }
    return unique
  }

  function buildPublicUrl(fileKey) {
    const key = String(fileKey || '').replace(/^\/+/, '')
    if (cfg.STORAGE_PUBLIC_READ === false) {
      const apiBase = String(cfg.API_PUBLIC_URL || '').replace(/\/$/, '')
      return `${apiBase}/api/files/object?key=${encodeURIComponent(key)}`
    }
    const base = String(cfg.STORAGE_PUBLIC_URL || cfg.STORAGE_ENDPOINT || '').replace(/\/$/, '')
    const bucket = cfg.STORAGE_BUCKET
    return `${base}/${bucket}/${key}`
  }

  function publicReadPolicy(bucket) {
    return JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        },
      ],
    })
  }

  async function ensureBucketExists(s3, bucket) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }))
      return { bucket, created: false }
    } catch (err) {
      const status = err?.$metadata?.httpStatusCode
      const missing = status === 404 || err?.name === 'NotFound' || err?.Code === 'NoSuchBucket'
      if (!missing) throw err
    }

    await s3.send(new CreateBucketCommand({ Bucket: bucket }))
    logger.info('Created object storage bucket', { bucket })

    if (cfg.STORAGE_PUBLIC_READ !== false) {
      try {
        await s3.send(
          new PutBucketPolicyCommand({
            Bucket: bucket,
            Policy: publicReadPolicy(bucket),
          })
        )
      } catch (policyErr) {
        logger.warn('Could not set public read policy on bucket', {
          bucket,
          message: policyErr?.message,
        })
      }
    }

    return { bucket, created: true }
  }

  return {
    async ensureReady() {
      const s3 = getInternalClient()
      const buckets = getConfiguredBuckets()
      const results = []
      for (const bucket of buckets) {
        results.push(await ensureBucketExists(s3, bucket))
      }
      return results
    },

    async checkHealth() {
      const bucket = cfg.STORAGE_BUCKET
      const s3 = getInternalClient()
      try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }))
        return {
          ok: true,
          driver: 's3',
          endpoint: cfg.STORAGE_ENDPOINT,
          publicUrl: cfg.STORAGE_PUBLIC_URL,
          bucket,
          buckets: getConfiguredBuckets(),
        }
      } catch (err) {
        return {
          ok: false,
          driver: 's3',
          endpoint: cfg.STORAGE_ENDPOINT,
          publicUrl: cfg.STORAGE_PUBLIC_URL,
          bucket,
          buckets: getConfiguredBuckets(),
          error: err?.message || 'Storage unavailable',
        }
      }
    },

    buildPublicUrl,

    async createPresignedUpload({ fileKey, fileType, expiresIn = 300, userId, fileSize }) {
      const publicUrl = buildPublicUrl(fileKey)
      const maxBytes =
        fileSize != null && Number(fileSize) > 0
          ? Math.min(Math.floor(Number(fileSize)), MAX_UPLOAD_BYTES)
          : MAX_UPLOAD_BYTES

      // Private buckets (Railway): browser uploads via API to avoid storage endpoint CORS.
      if (cfg.STORAGE_PUBLIC_READ === false) {
        if (!userId) {
          throw new Error('userId is required for upload tokens')
        }
        const expiresAt = Date.now() + expiresIn * 1000
        const token = createUploadToken({
          secret: cfg.SESSION_SECRET,
          fileKey,
          contentType: fileType,
          expiresAt,
          userId,
          maxBytes,
        })
        const apiBase = String(cfg.API_PUBLIC_URL || '').replace(/\/$/, '')
        return {
          presignedUrl: `${apiBase}/api/files/upload/${token}`,
          publicUrl,
          fileKey,
          bucket: cfg.STORAGE_BUCKET,
          method: 'PUT',
        }
      }

      const s3 = getPresignClient()
      const putParams = {
        Bucket: cfg.STORAGE_BUCKET,
        Key: fileKey,
        ContentType: fileType,
      }
      if (fileSize != null && Number(fileSize) > 0) {
        putParams.ContentLength = Math.min(Math.floor(Number(fileSize)), MAX_UPLOAD_BYTES)
      }
      const command = new PutObjectCommand(putParams)
      const presignOptions = { expiresIn }
      if (putParams.ContentLength != null) {
        presignOptions.signableHeaders = new Set(['content-type', 'content-length'])
        presignOptions.unhoistableHeaders = new Set(['content-length'])
      }
      const presignedUrl = await getSignedUrl(s3, command, presignOptions)
      return {
        presignedUrl,
        publicUrl,
        fileKey,
        bucket: cfg.STORAGE_BUCKET,
        method: 'PUT',
      }
    },

    async completeUpload(token, body, contentType) {
      const payload = verifyUploadToken(cfg.SESSION_SECRET, token)
      if (!payload) {
        throw Object.assign(new Error('Invalid or expired upload token'), {
          name: 'UPLOAD_TOKEN_INVALID',
        })
      }
      if (payload.contentType !== contentType) {
        throw Object.assign(new Error('Content-Type mismatch'), { name: 'UPLOAD_CONTENT_TYPE' })
      }
      const bodyLen = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '')
      const maxAllowed = payload.maxBytes ?? MAX_UPLOAD_BYTES
      if (bodyLen > maxAllowed) {
        throw Object.assign(new Error('Upload exceeds allowed size'), { name: 'UPLOAD_TOO_LARGE' })
      }
      // TODO: integrate async malware scanning (e.g. ClamAV) before marking upload complete.
      const safeKey = String(payload.fileKey).replace(/^\/+/, '')
      if (safeKey.includes('..')) {
        throw Object.assign(new Error('Invalid file key'), { name: 'UPLOAD_KEY_INVALID' })
      }

      const s3 = getInternalClient()
      await s3.send(
        new PutObjectCommand({
          Bucket: cfg.STORAGE_BUCKET,
          Key: safeKey,
          Body: body,
          ContentType: contentType,
        })
      )
      logger.info('S3 storage upload complete', { fileKey: safeKey, bytes: body.length })
      return { fileKey: safeKey }
    },

    async getObjectStream(fileKey) {
      const key = String(fileKey || '').replace(/^\/+/, '')
      if (!key || key.includes('..')) {
        throw Object.assign(new Error('Invalid file key'), { name: 'UPLOAD_KEY_INVALID' })
      }
      const s3 = getInternalClient()
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: cfg.STORAGE_BUCKET,
          Key: key,
        })
      )
      return {
        body: response.Body,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: response.ContentLength,
      }
    },
  }
}
