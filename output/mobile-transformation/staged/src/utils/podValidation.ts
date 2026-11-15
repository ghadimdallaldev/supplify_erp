import { File, UploadType } from 'expo-file-system'
import { Platform } from 'react-native'
import { resolveDevHostForAndroid } from '../config/env'
import { getAccessToken, getActiveTenantToken } from '../features/auth/tokenStorage'

export const MAX_POD_PHOTO_BYTES = 10 * 1024 * 1024

export function isPodPhotoWithinSizeLimit(bytes: number | null | undefined): boolean {
  if (bytes == null) return true
  return bytes <= MAX_POD_PHOTO_BYTES
}

export function resolvePresignUploadUrl(response: {
  presignedUrl?: string | null
  url?: string | null
}): string | null {
  return response.presignedUrl ?? response.url ?? null
}

export type PreparedPodImage = {
  uri: string
  blob: Blob
  bytes: number
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export class PodUploadError extends Error {
  code: string
  retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = code
    this.code = code
    this.retryable = retryable
  }
}

const POD_MIME_TYPES = new Set<PreparedPodImage['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/webp',
])

function normalizedMimeType(value?: string | null): PreparedPodImage['mimeType'] | null {
  const mimeType = String(value || '').split(';')[0].trim().toLowerCase()
  return POD_MIME_TYPES.has(mimeType as PreparedPodImage['mimeType'])
    ? (mimeType as PreparedPodImage['mimeType'])
    : null
}

/** Ensure the filename sent to presign has the same extension as the verified blob MIME. */
export function filenameForPodMime(fileName: string, mimeType: PreparedPodImage['mimeType']): string {
  const extension = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg'
  const base = String(fileName || 'pod-photo').replace(/\.[^.]+$/, '').trim() || 'pod-photo'
  return `${base}${extension}`
}

/** Android dev builds must reach the API gateway through the emulator host alias. */
export function resolvePodUploadUrl(uploadUrl: string): string {
  if (__DEV__ && Platform.OS === 'android') return resolveDevHostForAndroid(uploadUrl)
  return uploadUrl
}

function messageForUploadStatus(status: number, apiMessage: string | null): string {
  if (apiMessage) return apiMessage
  if (status === 413) return 'The proof photo is larger than 10 MB. Retake it and try again.'
  if (status === 400) return 'The proof photo was rejected. Retake it and try again.'
  if (status === 401 || status === 403) return 'The upload link expired. Please retry the photo upload.'
  if (status >= 500) return 'The upload service is temporarily unavailable. Please try again.'
  return 'The proof photo could not be uploaded. Please try again.'
}

function throwUploadFailure(status: number, body: string): never {
  let code = 'UPLOAD_FAILED'
  let apiMessage: string | null = null
  try {
    const data = JSON.parse(body) as { error?: { name?: unknown; message?: unknown } }
    if (typeof data?.error?.name === 'string') code = data.error.name
    apiMessage = typeof data?.error?.message === 'string' ? data.error.message : null
  } catch {
    // Gateway errors are not guaranteed to be JSON.
  }
  if (code === 'UPLOAD_MALWARE_DETECTED' || status === 422) {
    throw new PodUploadError(
      'UPLOAD_MALWARE_DETECTED',
      'This photo was rejected by the security scan. Retake or choose a different photo.',
      false
    )
  }
  if (code === 'MALWARE_SCAN_UNAVAILABLE' || status === 503) {
    throw new PodUploadError(
      'MALWARE_SCAN_UNAVAILABLE',
      'The security scan is temporarily unavailable. Retry this photo upload.',
      true
    )
  }
  throw new PodUploadError(code, apiMessage ?? messageForUploadStatus(status, null), status >= 500)
}

/** Read the local file before presigning, so size and MIME describe the actual bytes. */
export async function preparePodImage(
  uri: string,
  assetMimeType?: string | null
): Promise<PreparedPodImage> {
  let source: Response
  try {
    source = await fetch(uri)
  } catch {
    throw new Error('Could not read the captured proof image from this device.')
  }
  if (!source.ok) throw new Error('Could not read the captured proof image from this device.')

  const blob = await source.blob()
  if (!blob.size) throw new Error('The proof image is empty. Retake the photo and try again.')
  if (blob.size > MAX_POD_PHOTO_BYTES) {
    throw new Error('The proof image is larger than 10 MB. Retake the photo and try again.')
  }

  const mimeType = normalizedMimeType(blob.type) ?? normalizedMimeType(assetMimeType)
  if (!mimeType) {
    throw new Error('Use a JPEG, PNG, or WebP proof photo and try again.')
  }
  return { uri, blob, bytes: blob.size, mimeType }
}

/** PUT the captured file as raw bytes. A Blob body is dropped by iOS fetch. */
export async function uploadPreparedPodImage(
  uploadUrl: string,
  prepared: PreparedPodImage
): Promise<void> {
  let result: { status: number; body: string }
  try {
    const [accessToken, activeTenantToken] = await Promise.all([
      getAccessToken(),
      getActiveTenantToken(),
    ])
    const headers: Record<string, string> = {
      'Content-Type': prepared.mimeType,
      'X-Requested-With': 'Supplify',
    }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    if (activeTenantToken) headers['X-Active-Tenant-Token'] = activeTenantToken
    result = await new File(prepared.uri).upload(resolvePodUploadUrl(uploadUrl), {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers,
      mimeType: prepared.mimeType,
    })
  } catch (error) {
    if (error instanceof PodUploadError) throw error
    throw new Error('Network interrupted the proof upload. Check your connection and retry.')
  }
  if (result.status < 200 || result.status >= 300) {
    throwUploadFailure(result.status, result.body || '')
  }
}
