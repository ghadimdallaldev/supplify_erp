import { evaluatePlanFeatureValue } from './feature-flags.js'

/**
 * Resolve custom_branding plan value into capability flags.
 * @param {unknown} featureValue
 */
export function resolveBrandingCapabilities(featureValue) {
  if (!evaluatePlanFeatureValue(featureValue)) {
    return {
      enabled: false,
      rawValue: featureValue ?? false,
      capabilities: {
        logoAndColors: false,
        customDomain: false,
      },
    }
  }

  const raw = typeof featureValue === 'string' ? featureValue.trim().toLowerCase() : featureValue
  const whiteLabel = raw === 'white_label_domain' || raw === true

  return {
    enabled: true,
    rawValue: featureValue,
    capabilities: {
      logoAndColors: true,
      customDomain: whiteLabel,
    },
  }
}

/**
 * @param {unknown} featureValue
 * @param {'logoAndColors' | 'customDomain'} capability
 */
export function hasBrandingCapability(featureValue, capability) {
  return resolveBrandingCapabilities(featureValue).capabilities[capability] === true
}
