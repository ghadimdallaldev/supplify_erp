import path from 'node:path'

const MAX_FILENAME_LENGTH = 200

/**
 * Strip path segments and unsafe characters from user-supplied file names.
 */
export function sanitizeUploadFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Invalid file name')
  }
  const base = path.basename(fileName.trim())
  const sanitized = base.replace(/[^\w.\-()+ ]/g, '_').slice(0, MAX_FILENAME_LENGTH)
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error('Invalid file name')
  }
  return sanitized
}

/**
 * Ensure S3 object key is under the caller's upload prefix (prevents path traversal on attach).
 */
export function assertUploadKeyOwnedByUser(fileKey, userId) {
  if (!fileKey || typeof fileKey !== 'string') {
    throw new Error('Invalid file key')
  }
  const normalized = fileKey.replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized.includes('..')) {
    throw new Error('Invalid file key')
  }
  const expectedPrefix = `uploads/${userId}/`
  if (!normalized.startsWith(expectedPrefix)) {
    throw new Error('File key does not belong to this user')
  }
  return normalized
}

/**
 * Chat attachments must reference the caller's upload prefix on configured object storage.
 */
export function assertChatAttachmentUrl(fileUrl, userId) {
  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new Error('Invalid attachment URL')
  }
  let pathname
  try {
    pathname = new URL(fileUrl).pathname.replace(/^\/+/, '')
  } catch {
    throw new Error('Invalid attachment URL')
  }
  const bucket = process.env.STORAGE_BUCKET || process.env.S3_BUCKET || ''
  const bucketPrefix = bucket ? `${bucket}/` : ''
  const key = pathname.startsWith(bucketPrefix) ? pathname.slice(bucketPrefix.length) : pathname
  return assertUploadKeyOwnedByUser(key, userId)
}
