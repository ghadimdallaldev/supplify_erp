export type GatewayPresign = {
  presignedUrl?: string
  url?: string
  fileKey: string
}

export class FileUploadError extends Error {
  code: string
  retryable: boolean

  constructor(code: string, message: string, retryable = false) {
    super(message)
    this.name = code
    this.code = code
    this.retryable = retryable
  }
}

/** Upload through the authenticated API gateway; direct bucket PUTs are not supported. */
export async function uploadFileThroughGateway(
  presign: GatewayPresign,
  file: Blob,
  fileType: string
): Promise<string> {
  const uploadUrl = presign.presignedUrl || presign.url
  if (!uploadUrl || !/\/api\/files\/upload(?:-import)?\//.test(uploadUrl)) {
    throw new FileUploadError(
      'UPLOAD_URL_INVALID',
      'The upload service returned an invalid upload link.'
    )
  }

  let response: Response
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      credentials: 'include',
      headers: {
        'Content-Type': fileType || 'application/octet-stream',
        'X-Requested-With': 'Supplify',
      },
    })
  } catch {
    throw new FileUploadError(
      'UPLOAD_NETWORK_ERROR',
      'The upload was interrupted. Check your connection and retry.',
      true
    )
  }

  if (response.ok) return presign.fileKey

  let code = 'UPLOAD_FAILED'
  let message: string | null = null
  try {
    const data = (await response.json()) as { error?: { name?: unknown; message?: unknown } }
    if (typeof data?.error?.name === 'string') code = data.error.name
    if (typeof data?.error?.message === 'string') message = data.error.message
  } catch {
    // Gateway errors are not guaranteed to be JSON.
  }

  if (code === 'UPLOAD_MALWARE_DETECTED' || response.status === 422) {
    throw new FileUploadError(
      'UPLOAD_MALWARE_DETECTED',
      'This file was rejected by the security scan. Select a different file.',
      false
    )
  }
  if (code === 'MALWARE_SCAN_UNAVAILABLE' || response.status === 503) {
    throw new FileUploadError(
      'MALWARE_SCAN_UNAVAILABLE',
      'Security scanning is temporarily unavailable. Retry this upload.',
      true
    )
  }
  throw new FileUploadError(
    code,
    message || 'The file could not be uploaded.',
    response.status >= 500
  )
}
