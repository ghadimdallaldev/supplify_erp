import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config/env.js'
import { logger } from './logger.js'

function createS3Client(endpoint) {
  return new S3Client({
    endpoint,
    region: config.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  })
}

/** @type {S3Client | null} */
let internalClient = null
/** @type {S3Client | null} */
let presignClient = null

/** Server-side checks (HeadBucket, CreateBucket) — use internal Docker/network endpoint. */
export function getObjectStorageClient() {
  if (!internalClient) {
    internalClient = createS3Client(config.S3_ENDPOINT)
  }
  return internalClient
}

/** Presigned PUT URLs must use an endpoint the user's browser can reach. */
function getPresignClient() {
  const presignEndpoint = config.S3_PUBLIC_URL || config.S3_ENDPOINT
  if (presignEndpoint === config.S3_ENDPOINT) {
    return getObjectStorageClient()
  }
  if (!presignClient) {
    presignClient = createS3Client(presignEndpoint)
  }
  return presignClient
}

/** Buckets to ensure exist (primary + optional extras for future use). */
export function getConfiguredBuckets() {
  const raw = config.S3_BUCKETS || config.S3_BUCKET || 'supplify'
  const names = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const unique = [...new Set(names)]
  if (!unique.includes(config.S3_BUCKET)) {
    unique.unshift(config.S3_BUCKET)
  }
  return unique
}

export function buildObjectPublicUrl(bucket, fileKey) {
  const base = String(config.S3_PUBLIC_URL || config.S3_ENDPOINT || '').replace(/\/$/, '')
  const key = String(fileKey || '').replace(/^\/+/, '')
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

  if (config.S3_PUBLIC_READ !== false) {
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

/**
 * Ensure all configured buckets exist (API startup + deploy safety net).
 */
export async function ensureObjectStorageBuckets() {
  const s3 = getObjectStorageClient()
  const buckets = getConfiguredBuckets()
  const results = []

  for (const bucket of buckets) {
    results.push(await ensureBucketExists(s3, bucket))
  }

  return results
}

/**
 * Verify connectivity and that the active upload bucket is usable.
 */
export async function checkObjectStorageHealth() {
  const bucket = config.S3_BUCKET
  const s3 = getObjectStorageClient()

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }))
    return {
      ok: true,
      endpoint: config.S3_ENDPOINT,
      publicUrl: config.S3_PUBLIC_URL,
      bucket,
      buckets: getConfiguredBuckets(),
    }
  } catch (err) {
    return {
      ok: false,
      endpoint: config.S3_ENDPOINT,
      publicUrl: config.S3_PUBLIC_URL,
      bucket,
      buckets: getConfiguredBuckets(),
      error: err?.message || 'Storage unavailable',
    }
  }
}

export async function createPresignedUpload({ fileKey, fileType, expiresIn = 300 }) {
  const s3 = getPresignClient()
  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: fileKey,
    ContentType: fileType,
  })
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn })
  const publicUrl = buildObjectPublicUrl(config.S3_BUCKET, fileKey)
  return { presignedUrl, publicUrl, fileKey, bucket: config.S3_BUCKET }
}
