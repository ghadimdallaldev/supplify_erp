#!/usr/bin/env node
/**
 * Ensure MinIO/S3 buckets from S3_BUCKET / S3_BUCKETS exist (same logic as API startup).
 * Usage: node apps/api/scripts/ensure-minio-buckets.js
 */
import { ensureObjectStorageBuckets, checkObjectStorageHealth } from '../src/lib/object-storage.js'

const results = await ensureObjectStorageBuckets()
console.log(
  'Buckets ensured:',
  results.map((r) => `${r.bucket}${r.created ? ' (created)' : ''}`).join(', ')
)

const health = await checkObjectStorageHealth()
if (!health.ok) {
  console.error('Storage health check failed:', health.error)
  process.exit(1)
}
console.log('Storage OK:', health.endpoint, 'bucket=', health.bucket)
