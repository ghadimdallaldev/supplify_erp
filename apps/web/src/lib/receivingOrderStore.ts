/**
 * Persisted "receiving in progress" order ids for the Receiving page.
 *
 * Each entry stores the time it was added so a stale id (tab closed mid-submit,
 * report never found) can't leave the Receive button disabled forever.
 */
export const RECEIVING_ENTRY_TTL_MS = 2 * 60 * 1000

const LEGACY_KEY = 'receivingOrderIds'

export type ReceivingEntries = Record<string, number>

export function receivingStorageKey(scopeId?: string | null): string {
  return `receivingOrderIds:${scopeId || 'anon'}`
}

export function pruneReceivingEntries(
  entries: ReceivingEntries,
  now: number = Date.now()
): ReceivingEntries {
  const next: ReceivingEntries = {}
  for (const [id, addedAt] of Object.entries(entries)) {
    if (
      typeof addedAt === 'number' &&
      now - addedAt >= 0 &&
      now - addedAt < RECEIVING_ENTRY_TTL_MS
    ) {
      next[id] = addedAt
    }
  }
  return next
}

export function loadReceivingEntries(key: string, now: number = Date.now()): ReceivingEntries {
  if (typeof window === 'undefined') return {}
  try {
    // The unscoped, timestamp-less legacy entry is the source of the stuck-button bug.
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return pruneReceivingEntries(parsed as ReceivingEntries, now)
  } catch {
    return {}
  }
}

export function saveReceivingEntries(key: string, entries: ReceivingEntries): void {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(entries).length === 0) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, JSON.stringify(entries))
    }
  } catch {
    /* storage unavailable */
  }
}
