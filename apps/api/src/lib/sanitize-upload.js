import path from 'node:path'
import sharp from 'sharp'

const MAX_FILENAME_LENGTH = 200
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
/** Hard ceiling for bulk ZIP uploads. */
const MAX_IMPORT_ZIP_BYTES = 100 * 1024 * 1024

/** MIME type to allowed file extensions (lowercase, with dot). */
const MIME_TO_EXTENSIONS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
}

/** MIME types allowed for bulk product image import archives and manifests. */
const IMPORT_ALLOWED_MIMES = {
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
  'text/csv': ['.csv'],
  'application/csv': ['.csv'],
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

const MIME_TO_SHARP_FORMAT = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Validate uploaded image bytes match declared MIME (magic-byte check via sharp).
 * No-op for non-image content types (e.g. PDF).
 */
export async function assertImageUploadBytes(buffer, contentType) {
  if (!contentType || !String(contentType).startsWith('image/')) {
    return
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error('Invalid or empty image data'), { name: 'UPLOAD_INVALID_IMAGE' })
  }

  let metadata
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata()
  } catch {
    throw Object.assign(new Error('Invalid image file'), { name: 'UPLOAD_INVALID_IMAGE' })
  }

  if (!metadata.width || !metadata.height) {
    throw Object.assign(new Error('Invalid image file'), { name: 'UPLOAD_INVALID_IMAGE' })
  }

  const expectedFormat = MIME_TO_SHARP_FORMAT[contentType]
  if (expectedFormat && metadata.format !== expectedFormat) {
    throw Object.assign(new Error('Image content does not match declared type'), {
      name: 'UPLOAD_INVALID_IMAGE',
    })
  }
}

/** Normalize a request Content-Type before comparing it with a session. */
export function normalizeUploadMime(contentType) {
  return String(contentType || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
}

/** Validate bytes before any parser, optimizer, archive inspection, or persistence. */
export function assertUploadFileBytes(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error('Invalid or empty file data'), { name: 'UPLOAD_INVALID_FILE' })
  }

  const mime = normalizeUploadMime(contentType)
  const has = (...bytes) => bytes.every((byte, index) => buffer[index] === byte)
  const rejectMismatch = () => {
    throw Object.assign(new Error('File content does not match declared type'), {
      name: 'UPLOAD_INVALID_FILE',
    })
  }

  if (mime === 'image/jpeg' && !has(0xff, 0xd8, 0xff)) rejectMismatch()
  if (
    mime === 'image/png' &&
    !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    rejectMismatch()
  }
  if (
    mime === 'image/webp' &&
    (!has(0x52, 0x49, 0x46, 0x46) || buffer.subarray(8, 12).toString('ascii') !== 'WEBP')
  ) {
    rejectMismatch()
  }
  if (mime === 'application/pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    rejectMismatch()
  }
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') {
    const zipMagic =
      buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
      buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
      buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]))
    if (!zipMagic) rejectMismatch()
  }
  if (mime === 'text/csv' || mime === 'application/csv') {
    const text = buffer.toString('utf8')
    const hasUnsafeControl = [...text].some((character) => {
      const code = character.charCodeAt(0)
      return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31)
    })
    if (text.includes('\uFFFD') || hasUnsafeControl) {
      throw Object.assign(new Error('CSV must be valid safe text'), { name: 'UPLOAD_INVALID_FILE' })
    }
  }
  return true
}

export { MAX_UPLOAD_BYTES, MAX_IMPORT_ZIP_BYTES, IMPORT_ALLOWED_MIMES }

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

/**
 * Prefix formula-trigger characters so spreadsheet apps do not execute cell content.
 */
export function neutralizeCsvField(value) {
  const text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) {
    return `'${text}`
  }
  return text
}

/** Escape and neutralize a CSV field for safe download. */
export function escapeCsvField(value) {
  const text = neutralizeCsvField(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}
