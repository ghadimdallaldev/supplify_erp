import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  ALLOWED_IMAGE_EXTENSIONS,
  isAllowedImageFilename,
  isSafeZipEntryPath,
  optimizeProductImage,
} from './image-optimization.service.js'

describe('image-optimization.service', () => {
  describe('isAllowedImageFilename', () => {
    it('accepts allowed extensions', () => {
      for (const ext of ALLOWED_IMAGE_EXTENSIONS) {
        expect(isAllowedImageFilename(`product${ext}`)).toBe(true)
        expect(isAllowedImageFilename(`product${ext.toUpperCase()}`)).toBe(true)
      }
    })

    it('rejects unsupported extensions', () => {
      expect(isAllowedImageFilename('product.gif')).toBe(false)
      expect(isAllowedImageFilename('product.bmp')).toBe(false)
      expect(isAllowedImageFilename('product')).toBe(false)
      expect(isAllowedImageFilename('')).toBe(false)
      expect(isAllowedImageFilename(null)).toBe(false)
    })
  })

  describe('isSafeZipEntryPath', () => {
    it('accepts relative paths without traversal', () => {
      expect(isSafeZipEntryPath('images/sku-001.jpg')).toBe(true)
      expect(isSafeZipEntryPath('./images/sku-001.jpg')).toBe(true)
      expect(isSafeZipEntryPath('sku-001.jpg')).toBe(true)
    })

    it('rejects path traversal and absolute paths', () => {
      expect(isSafeZipEntryPath('../etc/passwd')).toBe(false)
      expect(isSafeZipEntryPath('images/../../secret.jpg')).toBe(false)
      expect(isSafeZipEntryPath('/etc/passwd')).toBe(false)
      expect(isSafeZipEntryPath('\\Windows\\System32\\file.jpg')).toBe(false)
      expect(isSafeZipEntryPath('C:/Windows/file.jpg')).toBe(false)
      expect(isSafeZipEntryPath('')).toBe(false)
      expect(isSafeZipEntryPath(null)).toBe(false)
    })
  })

  describe('optimizeProductImage', () => {
    it('optimizes a tiny generated png buffer', async () => {
      const sourceBuffer = await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer()

      const result = await optimizeProductImage(sourceBuffer, 'product.png')

      expect(result.mainBuffer).toBeInstanceOf(Buffer)
      expect(result.mainBuffer.length).toBeGreaterThan(0)
      expect(result.thumbBuffer).toBeInstanceOf(Buffer)
      expect(result.thumbBuffer.length).toBeGreaterThan(0)
      expect(['image/webp', 'image/png']).toContain(result.mainContentType)
      expect(result.thumbContentType).toBe(result.mainContentType)

      const mainMeta = await sharp(result.mainBuffer).metadata()
      const thumbMeta = await sharp(result.thumbBuffer).metadata()
      expect(mainMeta.width).toBeLessThanOrEqual(1200)
      expect(thumbMeta.width).toBeLessThanOrEqual(400)
    })

    it('rejects invalid image data', async () => {
      await expect(
        optimizeProductImage(Buffer.from('not-an-image'), 'product.png')
      ).rejects.toMatchObject({ name: 'ValidationError' })
    })
  })
})
