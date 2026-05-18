/** UI helpers for plan usage meters (display only — enforcement uses raw counts). */

export type UsageMeterDisplay = {
  actual: number
  limit: number
  /** Shown as X in "X / limit" — never above plan cap */
  display: number
  pct: number
  atCap: boolean
  /** Usage existed before a lower plan limit (e.g. extra branches) */
  grandfathered: boolean
}

export function getUsageMeterDisplay(current: number, limit: number): UsageMeterDisplay {
  const safeLimit = Math.max(0, limit)
  const actual = Math.max(0, current)
  const atCap = safeLimit > 0 && actual >= safeLimit
  const display = safeLimit > 0 ? Math.min(actual, safeLimit) : actual
  const pct = safeLimit > 0 ? Math.min(100, (display / safeLimit) * 100) : 0
  const grandfathered = safeLimit > 0 && actual > safeLimit

  return { actual, limit: safeLimit, display, pct, atCap, grandfathered }
}
