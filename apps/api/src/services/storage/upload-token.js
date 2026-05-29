import { createHmac, timingSafeEqual } from 'node:crypto'

function signPayload(secret, payloadB64) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/**
 * @param {object} params
 * @param {string} params.secret
 * @param {string} params.fileKey
 * @param {string} params.contentType
 * @param {number} params.expiresAt Unix ms
 * @param {string} params.userId
 */
export function createUploadToken({ secret, fileKey, contentType, expiresAt, userId }) {
  const payload = { fileKey, contentType, expiresAt, userId }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = signPayload(secret, payloadB64)
  return `${payloadB64}.${sig}`
}

/**
 * @returns {{ fileKey: string; contentType: string; expiresAt: number; userId: string } | null}
 */
export function verifyUploadToken(secret, token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expected = signPayload(secret, payloadB64)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!payload?.fileKey || !payload?.contentType || !payload?.userId) return null
  if (typeof payload.expiresAt !== 'number' || Date.now() > payload.expiresAt) return null
  return payload
}
