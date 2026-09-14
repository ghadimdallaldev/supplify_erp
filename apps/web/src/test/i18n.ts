import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LOCALE,
  EAGER_NAMESPACES,
  LAZY_NAMESPACES,
  getLanguageDirection,
  isSupportedLocale,
} from '../i18n/config'

const enGlob = import.meta.glob('../i18n/locales/en/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, object>

const arGlob = import.meta.glob('../i18n/locales/ar/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, object>

function bundleFromGlob(glob: Record<string, object>) {
  const out: Record<string, object> = {}
  for (const [path, data] of Object.entries(glob)) {
    const match = path.match(/\/([^/]+)\.json$/)
    if (match) out[match[1]] = data
  }
  return out
}

const ALL_NAMESPACES = [...EAGER_NAMESPACES, ...LAZY_NAMESPACES]

/** Same singleton as production libs (deliveryEtaDisplay, deliveryTrackingLabels, etc.) */
export const testI18n = i18n

let initPromise: Promise<void> | null = null

function addMissingBundles() {
  const en = bundleFromGlob(enGlob)
  const ar = bundleFromGlob(arGlob)
  const nsSet = new Set(
    (Array.isArray(i18n.options.ns) ? i18n.options.ns : [i18n.options.ns]).filter(
      Boolean
    ) as string[]
  )
  for (const ns of ALL_NAMESPACES) {
    nsSet.add(ns)
    if (en[ns] && !i18n.hasResourceBundle('en', ns)) {
      i18n.addResourceBundle('en', ns, en[ns], true, true)
    }
    if (ar[ns] && !i18n.hasResourceBundle('ar', ns)) {
      i18n.addResourceBundle('ar', ns, ar[ns], true, true)
    }
  }
  i18n.options.ns = Array.from(nsSet)
}

export function ensureTestI18n(): Promise<void> {
  if (initPromise) return initPromise

  if (i18n.isInitialized) {
    addMissingBundles()
    initPromise = Promise.resolve()
    return initPromise
  }

  initPromise = i18n
    .use(initReactI18next)
    .init({
      lng: DEFAULT_LOCALE,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: ['en', 'ar'],
      ns: ALL_NAMESPACES,
      defaultNS: 'common',
      resources: {
        en: bundleFromGlob(enGlob),
        ar: bundleFromGlob(arGlob),
      },
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      react: { useSuspense: false },
    })
    .then(() => undefined)

  return initPromise
}

void ensureTestI18n()

/** Reset language and HTML attributes between component tests */
export async function resetTestI18n() {
  await ensureTestI18n()
  addMissingBundles()
  await testI18n.changeLanguage(DEFAULT_LOCALE)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = DEFAULT_LOCALE
    document.documentElement.dir = getLanguageDirection(DEFAULT_LOCALE)
  }
}

/** Mirrors production changeAppLanguage for isolated component tests */
export async function changeTestLanguage(locale: string) {
  await ensureTestI18n()
  addMissingBundles()
  const next = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE
  await testI18n.changeLanguage(next)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next
    document.documentElement.dir = getLanguageDirection(next)
  }
}
