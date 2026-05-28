/** @typedef {'RESTAURANT' | 'SUPPLIER'} TenantType */

export const LEGAL_PACK_VERSION = '2026-05-28'

/** Slugs stored in legal_acceptance.document_slug */
export const LEGAL_DOCUMENT_SLUGS = {
  TERMS_AND_CONDITIONS: 'terms_and_conditions',
  PRIVACY_POLICY: 'privacy_policy',
  ACCEPTABLE_USE_POLICY: 'acceptable_use_policy',
  DATA_PROCESSING_ADDENDUM: 'data_processing_addendum',
  COOKIE_POLICY: 'cookie_policy',
  RESTAURANT_AGREEMENT: 'restaurant_agreement',
  SUPPLIER_AGREEMENT: 'supplier_agreement',
  MOBILE_APP_TERMS: 'mobile_app_terms',
  SUBSCRIPTION_ADDON_TERMS: 'subscription_addon_terms',
  DEALS_BOOST_TERMS: 'deals_boost_terms',
}

const REGISTRATION_CORE = [
  LEGAL_DOCUMENT_SLUGS.TERMS_AND_CONDITIONS,
  LEGAL_DOCUMENT_SLUGS.PRIVACY_POLICY,
  LEGAL_DOCUMENT_SLUGS.ACCEPTABLE_USE_POLICY,
  LEGAL_DOCUMENT_SLUGS.DATA_PROCESSING_ADDENDUM,
  LEGAL_DOCUMENT_SLUGS.COOKIE_POLICY,
  LEGAL_DOCUMENT_SLUGS.MOBILE_APP_TERMS,
]

/**
 * Required legal documents when a user creates a new tenant account.
 * @param {TenantType} accountType
 * @returns {string[]}
 */
export function requiredRegistrationDocuments(accountType) {
  const roleDoc =
    accountType === 'SUPPLIER'
      ? LEGAL_DOCUMENT_SLUGS.SUPPLIER_AGREEMENT
      : LEGAL_DOCUMENT_SLUGS.RESTAURANT_AGREEMENT
  return [...REGISTRATION_CORE, roleDoc]
}

/**
 * Required when joining via invitation (staff) — platform policies only.
 * @returns {string[]}
 */
export function requiredInviteDocuments() {
  return [
    LEGAL_DOCUMENT_SLUGS.TERMS_AND_CONDITIONS,
    LEGAL_DOCUMENT_SLUGS.PRIVACY_POLICY,
    LEGAL_DOCUMENT_SLUGS.ACCEPTABLE_USE_POLICY,
    LEGAL_DOCUMENT_SLUGS.DATA_PROCESSING_ADDENDUM,
    LEGAL_DOCUMENT_SLUGS.COOKIE_POLICY,
  ]
}
