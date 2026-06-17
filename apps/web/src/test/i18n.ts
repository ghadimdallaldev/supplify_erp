import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LOCALE,
  EAGER_NAMESPACES,
  getLanguageDirection,
  isSupportedLocale,
} from '../i18n/config'
import enCommon from '../i18n/locales/en/common.json'
import enNavigation from '../i18n/locales/en/navigation.json'
import arCommon from '../i18n/locales/ar/common.json'
import arNavigation from '../i18n/locales/ar/navigation.json'

export const testI18n = i18n.createInstance()

testI18n.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
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

/** Reset language and HTML attributes between component tests */
export async function resetTestI18n() {
  await testI18n.changeLanguage(DEFAULT_LOCALE)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = DEFAULT_LOCALE
    document.documentElement.dir = getLanguageDirection(DEFAULT_LOCALE)
  }
}

/** Mirrors production changeAppLanguage for isolated component tests */
export async function changeTestLanguage(locale: string) {
  const next = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  await testI18n.changeLanguage(next)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next
    document.documentElement.dir = getLanguageDirection(next)
  }
}
