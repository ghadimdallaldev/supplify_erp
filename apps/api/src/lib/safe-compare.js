import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string comparison. Both inputs are hashed first so the
 * timingSafeEqual buffers are always the same length (no length leak, no throw).
 * Returns false for non-string or empty input.
 */
export function safeEqualStrings(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false
  if (!provided || !expected) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
