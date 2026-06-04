import path from 'node:path'

const MAX_FILENAME_LENGTH = 200
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** MIME type to allowed file extensions (lowercase, with dot). */
const MIME_TO_EXTENSIONS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
}

/**
 * Reject obvious MIME/extension mismatches (e.g. .exe declared as image/jpeg).
 */
export function assertFileExtensionMatchesMime(fileName, mimeType) {
  const allowed = MIME_TO_EXTENSIONS[mimeType]
  if (!allowed) {
    throw new Error('File type not allowed')
  }
  const ext = path.extname(String(fileName || '')).toLowerCase()
  if (!ext || !allowed.includes(ext)) {
    throw new Error('File extension does not match content type')
  }
}

export { MAX_UPLOAD_BYTES }

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
 * Resolve object key from a stored public URL (direct bucket URL or API proxy).
 */
export function resolveUploadKeyFromPublicUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new Error('Invalid attachment URL')
  }
  let parsed
  try {
    parsed = new URL(fileUrl)
  } catch {
    throw new Error('Invalid attachment URL')
  }
  if (parsed.pathname.replace(/\/+$/, '').endsWith('/api/files/object')) {
    const key = parsed.searchParams.get('key')
    if (!key) throw new Error('Invalid attachment URL')
    return key.replace(/^\/+/, '')
  }
  const pathname = parsed.pathname.replace(/^\/+/, '')
  const bucket = process.env.STORAGE_BUCKET || process.env.S3_BUCKET || process.env.BUCKET || ''
  const bucketPrefix = bucket ? `${bucket}/` : ''
  return pathname.startsWith(bucketPrefix) ? pathname.slice(bucketPrefix.length) : pathname
}

/**
 * Chat attachments must reference the caller's upload prefix on configured object storage.
 */
export function assertChatAttachmentUrl(fileUrl, userId) {
  const key = resolveUploadKeyFromPublicUrl(fileUrl)
  return assertUploadKeyOwnedByUser(key, userId)
}

/** Alias for staff documents and other presigned file references. */
export function assertPresignedFileUrl(fileUrl, userId) {
  return assertChatAttachmentUrl(fileUrl, userId)
}
