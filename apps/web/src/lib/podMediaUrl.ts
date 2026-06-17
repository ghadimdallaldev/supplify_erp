import { getApiBase } from './env'
import type { ProofOfDelivery } from '../types/orders'

/** Resolve a viewable URL for POD photo or signature media. */
export function resolvePodMediaUrl(
  proof: ProofOfDelivery | null | undefined,
  kind: 'photo' | 'signature'
): string | null {
  if (!proof) return null
  const directUrl = kind === 'photo' ? proof.delivery_photo_url : proof.signature_image_url
  if (directUrl) return directUrl
  const fileKey = kind === 'photo' ? proof.file_key : proof.signature_file_key
  if (!fileKey) return null
  const apiBase = getApiBase().replace(/\/$/, '')
  return `${apiBase}/api/files/object?key=${encodeURIComponent(fileKey)}`
}
