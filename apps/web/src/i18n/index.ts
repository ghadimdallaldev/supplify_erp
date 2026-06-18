import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LOCALE,
  EAGER_NAMESPACES,
  LOCALE_STORAGE_KEY,
  getLanguageDirection,
  isSupportedLocale,
} from './config'
import { loadNamespace, loadNamespaces } from './loadNamespace'
import type { I18nNamespace } from './config'

import enCommon from './locales/en/common.json'
import enNavigation from './locales/en/navigation.json'
import arCommon from './locales/ar/common.json'
import arNavigation from './locales/ar/navigation.json'

function readStoredLocale(): string {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isSupportedLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
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

export async function changeAppLanguage(locale: string) {
  const next = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  await i18n.changeLanguage(next)
  applyHtmlAttributes(next)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // ignore storage failures
  }
}

export async function ensureNamespace(ns: I18nNamespace) {
  const lng = getActiveLocale()
  await loadNamespace(i18n, lng, ns)
}

const initialLocale = readStoredLocale()

void i18n.use(initReactI18next).init({
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: ['en', 'ar'],
  ns: [...EAGER_NAMESPACES],
  defaultNS: 'common',
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

i18n.on('languageChanged', (lng) => {
  applyHtmlAttributes(lng.split('-')[0])
  void loadNamespaces(i18n, lng.split('-')[0], [
    'auth',
    'settings',
    'inventory',
    'consumer',
    'loyalty',
    'calendar',
  ])
})

export { i18n, loadNamespaces }
