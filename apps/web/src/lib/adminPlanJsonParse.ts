/** Parse admin plan limits JSON preserving numeric types (including -1). */
export function parsePlanLimitsJson(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Limits must be a JSON object')
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === -1) {
      out[key] = -1
      continue
    }
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      out[key] = value
      continue
    }
    throw new Error(`Invalid limit for "${key}": must be -1 or a non-negative integer`)
  }
  return out
}

/** Parse admin plan features JSON preserving booleans, numbers, and tier strings. */
export function parsePlanFeaturesJson(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Features must be a JSON object')
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || value === undefined) {
      out[key] = false
      continue
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      out[key] = value
      continue
    }
    if (typeof value === 'string') {
      if (value === '') {
        throw new Error(`Feature "${key}" cannot be an empty string`)
      }
      out[key] = value
      continue
    }
    throw new Error(`Invalid feature value for "${key}"`)
  }
  return out
}

export function stringifyPlanJson(value: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(value ?? {}, null, 2)
}
