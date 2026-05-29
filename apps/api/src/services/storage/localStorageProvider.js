import fs from 'node:fs/promises'
import path from 'node:path'
import { createUploadToken, verifyUploadToken } from './upload-token.js'
import { logger } from '../../lib/logger.js'

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
      return `${publicBase}/${key}`
    },

    async createPresignedUpload({ fileKey, fileType, expiresIn = 300, userId }) {
      if (!userId) {
        throw new Error('userId is required for local upload tokens')
      }
      const expiresAt = Date.now() + expiresIn * 1000
      const token = createUploadToken({
        secret: cfg.SESSION_SECRET,
        fileKey,
        contentType: fileType,
        expiresAt,
        userId,
      })
      const apiBase = String(cfg.API_PUBLIC_URL || '').replace(/\/$/, '')
      const presignedUrl = `${apiBase}/api/files/upload/${token}`
      const publicUrl = this.buildPublicUrl(fileKey)
      return {
        presignedUrl,
        publicUrl,
        fileKey,
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
      const safeKey = String(payload.fileKey).replace(/^\/+/, '')
      if (safeKey.includes('..')) {
        throw Object.assign(new Error('Invalid file key'), { name: 'UPLOAD_KEY_INVALID' })
      }
      const dest = path.join(rootDir, safeKey)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, body)
      logger.info('Local storage upload complete', { fileKey: safeKey, bytes: body.length })
      return { fileKey: safeKey }
    },
  }
}

export { verifyUploadToken }
