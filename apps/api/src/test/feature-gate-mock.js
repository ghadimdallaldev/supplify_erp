import { vi } from 'vitest'

/** @type {Record<string, boolean>} */
export const featureGateState = {}

/** @type {Record<string, boolean>} */
export const limitGateState = {}

export function resetFeatureGates(defaults = {}) {
  for (const key of Object.keys(featureGateState)) {
    delete featureGateState[key]
  }
  for (const key of Object.keys(limitGateState)) {
    delete limitGateState[key]
  }
  Object.assign(featureGateState, defaults)
}

export function setFeatureEnabled(key, enabled) {
  featureGateState[key] = enabled
}

export function createRequireFeatureMock() {
  return (featureKey, getTenantId, getTenantType) => {
    return async (req, res, next) => {
      const enabled = featureGateState[featureKey] !== false
      if (!enabled) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FEATURE_NOT_AVAILABLE',
            message: `Feature "${featureKey}" is not available on your plan`,
            featureKey,
          },
          requestId: req.requestId,
        })
      }
      next()
    }
  }
}

export function setLimitBlocked(meterType, blocked) {
  if (blocked) {
    limitGateState[meterType] = true
  } else {
    delete limitGateState[meterType]
  }
}

export function createRequireWithinLimitMock() {
  return (meterType) => {
    return async (req, res, next) => {
      if (limitGateState[meterType]) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'LIMIT_EXCEEDED',
            message: `Plan limit exceeded for "${meterType}"`,
            limitKey: meterType,
          },
          requestId: req.requestId,
        })
      }
      next()
    }
  }
}

export function mockSubscriptionModule() {
  return {
    requireFeature: createRequireFeatureMock(),
    requireWithinLimit: createRequireWithinLimitMock(),
    isFeatureEnabled: vi.fn(async (_tenantId, _tenantType, featureKey) => {
      return featureGateState[featureKey] !== false
    }),
  }
}
