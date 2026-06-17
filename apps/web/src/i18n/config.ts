export type SupportedLanguage = {
  code: string
  label: string
  dir: 'ltr' | 'rtl'
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
]

export const LOCALE_STORAGE_KEY = 'supplify.locale'
export const DEFAULT_LOCALE = 'en'

export const EAGER_NAMESPACES = ['common', 'navigation'] as const
export const LAZY_NAMESPACES = ['auth', 'settings'] as const

export type I18nNamespace = (typeof EAGER_NAMESPACES)[number] | (typeof LAZY_NAMESPACES)[number]

export function isSupportedLocale(code: string | null | undefined): code is string {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code)
}

export function getLanguageDirection(code: string): 'ltr' | 'rtl' {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code)?.dir ?? 'ltr'
}
