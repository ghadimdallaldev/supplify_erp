export const LEGAL_PACK_VERSION = '2026-06-09'

export const LEGAL_OPERATOR = {
  companyLegalName: 'Supplify',
  supportEmail: 'legal@supplify.com',
  privacyEmail: 'privacy@supplify.com',
  website: 'https://supplify.com',
  effectiveDate: 'May 28, 2026',
  lastUpdated: 'June 9, 2026',
}

export type LegalDocumentSlug =
  | 'terms_and_conditions'
  | 'privacy_policy'
  | 'acceptable_use_policy'
  | 'data_processing_addendum'
  | 'cookie_policy'
  | 'restaurant_agreement'
  | 'supplier_agreement'
  | 'mobile_app_terms'
  | 'subscription_addon_terms'
  | 'deals_boost_terms'

export type LegalDocumentMeta = {
  slug: LegalDocumentSlug
  title: string
  shortTitle: string
  fileName: string
  description: string
  category: 'core' | 'role' | 'product' | 'reference'
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentSlug, LegalDocumentMeta> = {
  terms_and_conditions: {
    slug: 'terms_and_conditions',
    title: 'Terms and Conditions',
    shortTitle: 'Terms',
    fileName: 'TERMS_AND_CONDITIONS.md',
    description: 'Master platform agreement for all Supplify users and services.',
    category: 'core',
  },
  privacy_policy: {
    slug: 'privacy_policy',
    title: 'Privacy Policy',
    shortTitle: 'Privacy',
    fileName: 'PRIVACY_POLICY.md',
    description: 'How we collect, use, and protect personal and business data.',
    category: 'core',
  },
  acceptable_use_policy: {
    slug: 'acceptable_use_policy',
    title: 'Acceptable Use Policy',
    shortTitle: 'AUP',
    fileName: 'ACCEPTABLE_USE_POLICY.md',
    description: 'Rules for lawful and responsible use of the platform.',
    category: 'core',
  },
  data_processing_addendum: {
    slug: 'data_processing_addendum',
    title: 'Data Processing Addendum',
    shortTitle: 'DPA',
    fileName: 'DATA_PROCESSING_ADDENDUM.md',
    description: 'B2B data processing terms for tenant business data.',
    category: 'core',
  },
  cookie_policy: {
    slug: 'cookie_policy',
    title: 'Cookie Policy',
    shortTitle: 'Cookies',
    fileName: 'COOKIE_POLICY.md',
    description: 'Cookies, sessions, and similar technologies we use.',
    category: 'core',
  },
  restaurant_agreement: {
    slug: 'restaurant_agreement',
    title: 'Restaurant Agreement',
    shortTitle: 'Restaurant Agreement',
    fileName: 'RESTAURANT_AGREEMENT.md',
    description: 'Additional terms for restaurant and food-service operators.',
    category: 'role',
  },
  supplier_agreement: {
    slug: 'supplier_agreement',
    title: 'Supplier Agreement',
    shortTitle: 'Supplier Agreement',
    fileName: 'SUPPLIER_AGREEMENT.md',
    description: 'Additional terms for suppliers, distributors, and vendors.',
    category: 'role',
  },
  mobile_app_terms: {
    slug: 'mobile_app_terms',
    title: 'Mobile App Terms',
    shortTitle: 'Mobile',
    fileName: 'MOBILE_APP_TERMS.md',
    description: 'Terms for mobile and installable app use, including PWA.',
    category: 'product',
  },
  subscription_addon_terms: {
    slug: 'subscription_addon_terms',
    title: 'Subscription & Add-on Terms',
    shortTitle: 'Subscriptions',
    fileName: 'SUBSCRIPTION_ADDON_TERMS.md',
    description: 'Plans, billing, trials, and add-on purchases.',
    category: 'reference',
  },
  deals_boost_terms: {
    slug: 'deals_boost_terms',
    title: 'Deals & Boost Terms',
    shortTitle: 'Deals & Boosts',
    fileName: 'DEALS_BOOST_TERMS.md',
    description: 'Terms for supplier deals, optional coupon codes, and paid visibility boosts.',
    category: 'reference',
  },
}

const REGISTRATION_CORE: LegalDocumentSlug[] = [
  'terms_and_conditions',
  'privacy_policy',
  'acceptable_use_policy',
  'data_processing_addendum',
  'cookie_policy',
  'mobile_app_terms',
]

export function requiredRegistrationSlugs(
  accountType: 'RESTAURANT' | 'SUPPLIER'
): LegalDocumentSlug[] {
  const roleSlug: LegalDocumentSlug =
    accountType === 'SUPPLIER' ? 'supplier_agreement' : 'restaurant_agreement'
  return [...REGISTRATION_CORE, roleSlug]
}

export function requiredInviteSlugs(): LegalDocumentSlug[] {
  return [
    'terms_and_conditions',
    'privacy_policy',
    'acceptable_use_policy',
    'data_processing_addendum',
    'cookie_policy',
  ]
}

export function legalDocumentPath(slug: LegalDocumentSlug): string {
  return `/legal/${slug}`
}

export function legalDocumentTitleKey(slug: LegalDocumentSlug): string {
  return `documents.${slug}.title`
}

export function legalDocumentDescriptionKey(slug: LegalDocumentSlug): string {
  return `documents.${slug}.description`
}

export function legalDocumentShortTitleKey(slug: LegalDocumentSlug): string {
  return `documents.${slug}.shortTitle`
}

export function legalDocumentAssetUrl(fileName: string, locale?: string): string {
  const lang = locale === 'ar' ? 'ar' : 'en'
  if (lang === 'ar') {
    return `/legal/ar/${fileName}`
  }
  return `/legal/${fileName}`
}

export type LegalAcceptancePayload = {
  packVersion: string
  acceptedDocuments: LegalDocumentSlug[]
  electronicSignatureAttestation: true
}

export function buildLegalAcceptancePayload(
  accepted: Set<LegalDocumentSlug>
): LegalAcceptancePayload {
  return {
    packVersion: LEGAL_PACK_VERSION,
    acceptedDocuments: Array.from(accepted),
    electronicSignatureAttestation: true,
  }
}
