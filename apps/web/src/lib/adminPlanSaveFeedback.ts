import type { SubscriptionPlan } from '../types'

export type AdminPlanUpdateResult = {
  plan: SubscriptionPlan
  validationWarnings: string[]
}

/** Normalize PATCH /plans response after API envelope unwrap. */
export function normalizeAdminPlanUpdateResult(
  raw: AdminPlanUpdateResult | SubscriptionPlan
): AdminPlanUpdateResult {
  if (raw && typeof raw === 'object' && 'plan' in raw && raw.plan) {
    return {
      plan: raw.plan as SubscriptionPlan,
      validationWarnings: Array.isArray(raw.validationWarnings)
        ? raw.validationWarnings.filter((w): w is string => typeof w === 'string' && w.length > 0)
        : [],
    }
  }
  return {
    plan: raw as SubscriptionPlan,
    validationWarnings: [],
  }
}

type ApiValidationDetail = {
  path?: (string | number)[]
  message?: string
}

/**
 * Full validation error text from admin plan save (includes Zod details when present).
 */
export function formatAdminPlanValidationError(err: unknown): string {
  const e = err as {
    data?: {
      message?: string
      details?: ApiValidationDetail[] | unknown
      error?: { message?: string; details?: ApiValidationDetail[] | unknown }
    }
    message?: string
  }

  const lines: string[] = []
  const apiMessage = e?.data?.message ?? e?.data?.error?.message
  if (apiMessage) lines.push(apiMessage)
  else if (e?.message) lines.push(e.message)

  const details = e?.data?.details ?? e?.data?.error?.details
  if (Array.isArray(details)) {
    for (const item of details) {
      if (!item || typeof item !== 'object') continue
      const path =
        'path' in item && Array.isArray(item.path) && item.path.length > 0
          ? item.path.map(String).join('.')
          : 'field'
      const msg = 'message' in item && typeof item.message === 'string' ? item.message : 'invalid'
      lines.push(`${path}: ${msg}`)
    }
  }

  if (lines.length === 0) return 'Failed to save plan'
  return lines.join('\n')
}

export { notifyAdminPlanSaveSuccess, notifyAdminPlanSaveError } from './adminPlanSaveFeedback.tsx'
