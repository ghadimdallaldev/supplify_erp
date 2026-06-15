import { config } from '../../config/env.js'
import { createLocalStorageProvider } from './localStorageProvider.js'
import { createS3CompatibleProvider } from './s3CompatibleProvider.js'

/** @type {import('./types.js').StorageProvider | null} */
let provider = null

export function getStorageDriver() {
  return config.STORAGE_DRIVER
}

export function getStorageProvider() {
  if (!provider) {
    if (config.STORAGE_DRIVER === 'local') {
      provider = createLocalStorageProvider(config)
    } else if (config.STORAGE_DRIVER === 's3') {
      provider = createS3CompatibleProvider(config)
    } else {
      throw new Error(`Unsupported STORAGE_DRIVER: ${config.STORAGE_DRIVER}`)
    }
  }
  return provider
}

export async function ensureStorageReady() {
  return getStorageProvider().ensureReady()
}

export async function checkStorageHealth() {
  return getStorageProvider().checkHealth()
}

export async function createPresignedUpload(options) {
  return getStorageProvider().createPresignedUpload(options)
}

export function buildObjectPublicUrl(fileKey) {
  return getStorageProvider().buildPublicUrl(fileKey)
}

/**
 * Stream a stored object (S3 or local). Used for private buckets (e.g. Railway).
 * @param {string} fileKey
 */
export async function getObjectStream(fileKey) {
  const provider = getStorageProvider()
  if (typeof provider.getObjectStream !== 'function') {
    throw new Error('Storage provider does not support getObjectStream')
  }
  return provider.getObjectStream(fileKey)
}

/**
 * Write an object directly (server-side). Used for import processing and internal copies.
 * @param {{ fileKey: string; body: Buffer | Uint8Array | string; contentType: string }} options
 */
export async function putObject(options) {
  const provider = getStorageProvider()
  if (typeof provider.putObject !== 'function') {
    throw new Error('Storage provider does not support putObject')
  }
  return provider.putObject(options)
}

/**
 * Remove a stored object. Used for import cleanup.
 * @param {string} fileKey
 */
export async function deleteObject(fileKey) {
  const provider = getStorageProvider()
  if (typeof provider.deleteObject !== 'function') {
    throw new Error('Storage provider does not support deleteObject')
  }
  return provider.deleteObject(fileKey)
}
