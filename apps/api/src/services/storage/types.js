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
 * @property {(opts: { fileKey: string; body: Buffer | Uint8Array | string; contentType: string }) => Promise<{ fileKey: string }>} [putObject]
 * @property {(fileKey: string) => Promise<{ fileKey: string }>} [deleteObject]
 * @property {(fileKey: string) => Promise<{ body: unknown; contentType: string; contentLength?: number }>} [getObjectStream]
 */

export {}
