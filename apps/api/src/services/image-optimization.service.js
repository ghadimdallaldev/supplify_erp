import path from 'path'
import sharp from 'sharp'
import { ValidationError } from '../middlewares/errorHandler.js'

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

const MAIN_MAX_WIDTH = 1200
const THUMB_MAX_WIDTH = 400
const WEBP_QUALITY = 82
const JPEG_QUALITY = 85

export function isAllowedImageFilename(fileName) {
  if (!fileName || typeof fileName !== 'string') return false
  const ext = path.extname(fileName).toLowerCase()
  return ALLOWED_IMAGE_EXTENSIONS.includes(ext)
}

export function isSafeZipEntryPath(entryPath) {
  if (!entryPath || typeof entryPath !== 'string') return false

  const normalized = entryPath.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return false
  }

  return !normalized.split('/').some((segment) => segment === '..')
}

async function encodeOptimizedVariant(pipeline, sourceFormat) {
  if (sourceFormat === 'jpeg' || sourceFormat === 'png') {
    const [webpBuffer, originalBuffer] = await Promise.all([
      pipeline.clone().webp({ quality: WEBP_QUALITY }).toBuffer(),
      sourceFormat === 'jpeg'
        ? pipeline.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()
        : pipeline.clone().png({ compressionLevel: 9 }).toBuffer(),
    ])

    if (webpBuffer.length <= originalBuffer.length) {
      return { buffer: webpBuffer, contentType: 'image/webp' }
    }

    return {
      buffer: originalBuffer,
      contentType: sourceFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
    }
  }

  const webpBuffer = await pipeline.clone().webp({ quality: WEBP_QUALITY }).toBuffer()
  return { buffer: webpBuffer, contentType: 'image/webp' }
}

export async function optimizeProductImage(buffer, fileName) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ValidationError('Invalid or empty image data')
  }

  if (!isAllowedImageFilename(fileName)) {
    throw new ValidationError(`Unsupported image format: ${fileName}`)
  }

  let metadata
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata()
  } catch {
    throw new ValidationError('Invalid image file')
  }

  if (!metadata.width || !metadata.height) {
    throw new ValidationError('Invalid image file')
  }

  const sourceFormat = metadata.format
  if (!['jpeg', 'png', 'webp'].includes(sourceFormat)) {
    throw new ValidationError('Invalid image file')
  }

  const oriented = sharp(buffer, { failOn: 'error' }).rotate()

  const [main, thumb] = await Promise.all([
    encodeOptimizedVariant(
      oriented.clone().resize({ width: MAIN_MAX_WIDTH, withoutEnlargement: true }),
      sourceFormat
    ),
    encodeOptimizedVariant(
      oriented.clone().resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true }),
      sourceFormat
    ),
  ])

  return {
    mainBuffer: main.buffer,
    mainContentType: main.contentType,
    thumbBuffer: thumb.buffer,
    thumbContentType: thumb.contentType,
  }
}
