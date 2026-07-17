import { config } from '../config/env.js'
import { isFeatureEnabledForTenant } from './feature-flags.js'
import { hasSmartReorderCapability } from './smart-reorder-tier.js'

/**
 * Platform-level AI kill switch (env) + per-tenant feature flag (plan / global / override).
 */
export function isAiEnvEnabled() {
  if (!config.AI_ENABLED) return false
  if (config.AI_PROVIDER === 'openai' && !config.OPENAI_API_KEY) return false
  return true
}

export async function isAiPlatformEnabledForTenant(tenantId, tenantType) {
  if (!isAiEnvEnabled()) return false
  return isFeatureEnabledForTenant(tenantId, tenantType, 'ai_platform')
}

/**
 * LLM explain: forecast-capable smart_reorder + ai_platform.
 */
export async function canUseReorderAiExplain(tenantId, tenantType, smartReorderFeatureValue) {
  if (!(await isAiPlatformEnabledForTenant(tenantId, tenantType))) return false
  return hasSmartReorderCapability(smartReorderFeatureValue, 'forecast')
}

/**
 * NL ask: seasonality-capable smart_reorder + ai_platform.
 */
export async function canUseReorderAiAsk(tenantId, tenantType, smartReorderFeatureValue) {
  if (!(await isAiPlatformEnabledForTenant(tenantId, tenantType))) return false
  return hasSmartReorderCapability(smartReorderFeatureValue, 'seasonality')
}

/**
 * Resolved LLM availability for reorder assistant UI and API metadata.
 * Heuristic explain/ask still work when `canExplainLlm` / `canAskLlm` are false.
 */
export async function resolveReorderAiCapabilities(tenantId, tenantType, smartReorderFeatureValue) {
  const envEnabled = isAiEnvEnabled()
  const platformEnabled = envEnabled
    ? await isAiPlatformEnabledForTenant(tenantId, tenantType)
    : false
  const [canExplainLlm, canAskLlm] = await Promise.all([
    canUseReorderAiExplain(tenantId, tenantType, smartReorderFeatureValue),
    canUseReorderAiAsk(tenantId, tenantType, smartReorderFeatureValue),
  ])

  return {
    envEnabled,
    platformEnabled,
    canExplainLlm,
    canAskLlm,
  }
}
