import fs from 'node:fs/promises'
import path from 'node:path'
import { logger } from '../../lib/logger.js'
import { appendObjectAccessSignature } from '../../lib/object-download-auth.js'

/**
 * @param {import('../../config/env.js').config} cfg
 */
export function createLocalStorageProvider(cfg) {
  const rootDir = path.resolve(cfg.STORAGE_LOCAL_PATH)
  const publicBase = String(cfg.STORAGE_PUBLIC_URL || '').replace(/\/$/, '')

  async function ensureDir() {
    await fs.mkdir(rootDir, { recursive: true })
  }

  return {
    async ensureReady() {
      await ensureDir()
      return [{ driver: 'local', path: rootDir, created: false }]
    },

    async checkHealth() {
      try {
        await ensureDir()
        await fs.access(rootDir)
        return {
          ok: true,
          driver: 'local',
          path: rootDir,
          publicUrl: publicBase,
        }
      } catch (err) {
        return {
          ok: false,
          driver: 'local',
          path: rootDir,
          publicUrl: publicBase,
          error: err?.message || 'Local storage unavailable',
        }
      }
    },

    buildPublicUrl(fileKey) {
      const key = String(fileKey || '').replace(/^\/+/, '')
      const apiBase = String(cfg.API_PUBLIC_URL || '').replace(/\/$/, '')
      const baseUrl = `${apiBase}/api/files/object?key=${encodeURIComponent(key)}`
      return appendObjectAccessSignature(baseUrl, key)
    },

    async getObjectStream(fileKey) {
      const safeKey = String(fileKey || '').replace(/^\/+/, '')
      if (!safeKey || safeKey.includes('..')) {
        throw Object.assign(new Error('Invalid file key'), { name: 'UPLOAD_KEY_INVALID' })
      }
      const dest = path.join(rootDir, safeKey)
      const data = await fs.readFile(dest)
      const { createHash } = await import('node:crypto')
      return {
        body: data,
        contentType: 'application/octet-stream',
        contentLength: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        etag: createHash('md5').update(data).digest('hex'),
        versionId: null,
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
      const dest = path.join(rootDir, safeKey)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, body)
      const bytes = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '')
      const { createHash } = await import('node:crypto')
      const etag = createHash('md5').update(body).digest('hex')
      logger.info('Local storage putObject', { objectClass: 'server-object', contentType, bytes })
      return { fileKey: safeKey, etag, versionId: null }
    },

    /**
     * Remove a stored object (import cleanup). Missing keys are ignored.
     * @param {string} fileKey
     */
    async deleteObject(fileKey) {
      const safeKey = String(fileKey || '').replace(/^\/+/, '')
      if (!safeKey || safeKey.includes('..')) {
        throw Object.assign(new Error('Invalid file key'), { name: 'UPLOAD_KEY_INVALID' })
      }
      const dest = path.join(rootDir, safeKey)
      try {
        await fs.unlink(dest)
        logger.info('Local storage deleteObject', { objectClass: 'server-object' })
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
      return { fileKey: safeKey }
    },
  }
}
