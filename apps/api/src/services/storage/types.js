/**
 * @typedef {object} PresignedUploadResult
 * @property {string} presignedUrl
 * @property {string} publicUrl
 * @property {string} fileKey
 * @property {string} [bucket]
 * @property {'PUT' | 'POST'} [method]
 */

/**
 * @typedef {object} StorageProvider
 * @property {() => Promise<unknown[]>} ensureReady
 * @property {() => Promise<{ ok: boolean; driver: string; [key: string]: unknown }>} checkHealth
 * @property {(opts: { fileKey: string; fileType: string; expiresIn?: number; userId?: string }) => Promise<PresignedUploadResult>} createPresignedUpload
 * @property {(fileKey: string) => string} buildPublicUrl
 * @property {(token: string, body: Buffer, contentType: string) => Promise<{ fileKey: string }>} [completeUpload]
 */

export {}
