import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LOCALE,
  EAGER_NAMESPACES,
  LAZY_NAMESPACES,
  LOCALE_STORAGE_KEY,
  getLanguageDirection,
  isSupportedLocale,
} from './config'
import {
  getActiveNamespaces,
  lazyLocaleBackend,
  loadNamespace,
  loadNamespaces,
} from './loadNamespace'
import { IDLE_PRELOAD_NAMESPACES } from './pageNamespaces'
import type { I18nNamespace } from './config'
import enCommon from './locales/en/common.json'
import enNavigation from './locales/en/navigation.json'
import arCommon from './locales/ar/common.json'
import arNavigation from './locales/ar/navigation.json'

const ALL_NAMESPACES = [...EAGER_NAMESPACES, ...LAZY_NAMESPACES] as const

export function readStoredLocale(): string {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isSupportedLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

async function syncLocalePreferenceToServer(locale: string) {
  try {
    const { store } = await import('../store')
    const { api } = await import('../services/api')
    await store
      .dispatch(api.endpoints.updateLocalePreference.initiate({ locale: locale as 'en' | 'ar' }))
      .unwrap()
  } catch {
    // User may be logged out or offline; local preference still applies.
  }
}

export function applyHtmlAttributes(locale: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = getLanguageDirection(locale)
}

export function getActiveLocale(): string {
  return i18n.language?.split('-')[0] || DEFAULT_LOCALE
}

type ChangeAppLanguageOptions = {
  /** Skip PATCH /auth/me/locale when applying server-side preference on login/init */
  skipServerSync?: boolean
}

export async function changeAppLanguage(locale: string, options?: ChangeAppLanguageOptions) {
  const next = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  await i18n.changeLanguage(next)
  applyHtmlAttributes(next)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // ignore storage failures
  }
  if (!options?.skipServerSync) {
    void syncLocalePreferenceToServer(next)
  }
}

export async function ensureNamespace(ns: I18nNamespace) {
  const lng = getActiveLocale()
  await loadNamespace(i18n, lng, ns)
}

const initialLocale = readStoredLocale()

if (!i18n.isInitialized) {
  void i18n
    .use(lazyLocaleBackend)
    .use(initReactI18next)
    .init({
      lng: initialLocale,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: ['en', 'ar'],
      ns: [...EAGER_NAMESPACES],
      defaultNS: 'common',
      partialBundledLanguages: true,
      resources: {
        en: {
          common: enCommon,
          navigation: enNavigation,
        },
        ar: {
          common: arCommon,
          navigation: arNavigation,
        },
      },
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      react: { useSuspense: false },
    })

  applyHtmlAttributes(initialLocale)
}

const nativeLoadNamespaces = i18n.loadNamespaces.bind(i18n)
i18n.loadNamespaces = ((namespaces, callback) => {
  const requested = Array.isArray(namespaces) ? namespaces : [namespaces]
  const appNamespaces = requested.filter((ns): ns is I18nNamespace =>
    ALL_NAMESPACES.includes(ns as I18nNamespace)
  )

  if (appNamespaces.length === 0) {
    return nativeLoadNamespaces(namespaces, callback)
  }

  const promise = loadNamespaces(i18n, getActiveLocale(), appNamespaces)
  void promise.then(
    () => callback?.(undefined, i18n.t),
    (error) => callback?.(error, i18n.t)
  )
  return promise
}) as typeof i18n.loadNamespaces

i18n.on('languageChanged', (lng) => {
  const locale = lng.split('-')[0]
  applyHtmlAttributes(locale)
  const namespaces = getActiveNamespaces()
  if (namespaces.length > 0) {
    void loadNamespaces(i18n, locale, namespaces)
  }
})

if (typeof window !== 'undefined') {
  const warmNamespaces = () => {
    void loadNamespaces(i18n, getActiveLocale(), [...IDLE_PRELOAD_NAMESPACES])
  }
  const scheduleIdle =
    typeof requestIdleCallback === 'function'
      ? (cb: () => void) => requestIdleCallback(cb, { timeout: 4000 })
      : (cb: () => void) => window.setTimeout(cb, 2000)
  window.setTimeout(() => scheduleIdle(warmNamespaces), 1500)
}

export { i18n, loadNamespaces }
