import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketAclCommand,
  GetPublicAccessBlockCommand,
  GetBucketPolicyCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { logger } from '../../lib/logger.js'
import { appendObjectAccessSignature } from '../../lib/object-download-auth.js'

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
  function getInternalClient() {
    if (!internalClient) {
      internalClient = createS3Client(cfg, cfg.STORAGE_ENDPOINT)
    }
    return internalClient
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
    const apiBase = String(cfg.API_PUBLIC_URL || '').replace(/\/$/, '')
    const baseUrl = `${apiBase}/api/files/object?key=${encodeURIComponent(key)}`
    return appendObjectAccessSignature(baseUrl, key)
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
    logger.info('Created object storage bucket', { objectClass: 'private-upload-storage' })

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

    async checkPrivateAccess() {
      const s3 = getInternalClient()
      const bucketResults = []
      for (const bucket of getConfiguredBuckets()) {
        try {
          const acl = await s3.send(new GetBucketAclCommand({ Bucket: bucket }))
          const grants = acl?.Grants || []
          const publicGrant = grants.some((grant) =>
            [
              'http://acs.amazonaws.com/groups/global/AllUsers',
              'http://acs.amazonaws.com/groups/global/AuthenticatedUsers',
            ].includes(grant?.Grantee?.URI)
          )
          let publicPolicy = false
          try {
            const policy = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }))
            publicPolicy = /"principal"\s*:\s*\*|"aws"\s*:\s*\[?\s*"\*"/i.test(policy?.Policy || '')
          } catch (error) {
            if (
              !['NoSuchBucketPolicy', 'NoSuchBucketPolicyConfiguration', 'NotImplemented'].includes(
                error?.name
              )
            ) {
              throw error
            }
          }
          let blockPublic = true
          try {
            const block = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket }))
            blockPublic = Boolean(
              block?.PublicAccessBlockConfiguration?.BlockPublicAcls &&
                block?.PublicAccessBlockConfiguration?.IgnorePublicAcls &&
                block?.PublicAccessBlockConfiguration?.BlockPublicPolicy &&
                block?.PublicAccessBlockConfiguration?.RestrictPublicBuckets
            )
          } catch (error) {
            if (error?.name !== 'NotImplemented') throw error
            blockPublic = false
          }
          bucketResults.push({
            bucket,
            supported: true,
            private: !publicGrant && !publicPolicy && blockPublic,
          })
        } catch (error) {
          if (error?.name === 'NotImplemented') {
            bucketResults.push({ bucket, supported: false, private: false })
            continue
          }
          throw error
        }
      }
      return {
        supported: bucketResults.every((result) => result.supported),
        private: bucketResults.every((result) => result.private),
      }
    },

    buildPublicUrl,

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
        etag: response.ETag || null,
        versionId: response.VersionId || null,
      }
    },

    /**
     * Server-side write (import processing, internal copies).
     * @param {{ fileKey: string; body: Buffer | Uint8Array | string; contentType: string }} opts
     */
    async putObject({ fileKey, body, contentType }) {
      const safeKey = String(fileKey || '').replace(/^\/+/, '')
      if (!safeKey || safeKey.includes('..')) {
        throw Object.assign(new Error('Invalid file key'), { name: 'UPLOAD_KEY_INVALID' })
      }
      const s3 = getInternalClient()
      const result = await s3.send(
        new PutObjectCommand({
          Bucket: cfg.STORAGE_BUCKET,
          Key: safeKey,
          Body: body,
          ContentType: contentType,
        })
      )
      const bytes = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '')
      logger.info('S3 storage putObject', { objectClass: 'server-object', contentType, bytes })
      return { fileKey: safeKey, etag: result.ETag || null, versionId: result.VersionId || null }
    },

    /**
     * Remove a stored object (import cleanup). S3 treats missing keys as success.
     * @param {string} fileKey
     */
    async deleteObject(fileKey) {
      const safeKey = String(fileKey || '').replace(/^\/+/, '')
      if (!safeKey || safeKey.includes('..')) {
        throw Object.assign(new Error('Invalid file key'), { name: 'UPLOAD_KEY_INVALID' })
      }
      const s3 = getInternalClient()
      await s3.send(
        new DeleteObjectCommand({
          Bucket: cfg.STORAGE_BUCKET,
          Key: safeKey,
        })
      )
      logger.info('S3 storage deleteObject', { objectClass: 'server-object' })
      return { fileKey: safeKey }
    },
  }
}
