/** Persist only a digest and a random key; guest contact/address data stays out of this record. */
export async function guestCheckoutKey(scope: string, payload: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload))
  )
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  const storageKey = `guest-checkout-key:${scope}`
  try {
    const existing = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (existing?.fingerprint === fingerprint && typeof existing.key === 'string')
      return existing.key
  } catch {
    /* storage unavailable: the component retains the key for retries */
  }
  const key = crypto.randomUUID()
  try {
    localStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }))
  } catch {
    /* memory only */
  }
  return key
}

export function clearGuestCheckoutKey(scope: string) {
  try {
    localStorage.removeItem(`guest-checkout-key:${scope}`)
  } catch {
    /* storage unavailable */
  }
}
