import type { BackendModule, ResourceKey, i18n as I18nInstance } from 'i18next'
import { DEFAULT_LOCALE, isSupportedLocale } from './config'
import type { I18nNamespace } from './config'

const loaded = new Set<string>()
const activeNamespaces = new Set<I18nNamespace>()

type LocaleModule = { default: ResourceKey }

const localeModules = import.meta.glob('./locales/{en,ar}/*.json') as Record<
  string,
  () => Promise<LocaleModule>
>

function cacheKey(lng: string, ns: string) {
  return `${lng}:${ns}`
}

function normalizeLocale(lng: string) {
  const base = lng.split('-')[0]
  return isSupportedLocale(base) ? base : DEFAULT_LOCALE
}

async function loadLocaleResource(lng: string, ns: string) {
  const locale = normalizeLocale(lng)
  const importer = localeModules[`./locales/${locale}/${ns}.json`]

  if (!importer) {
    throw new Error(`Missing i18n namespace ${locale}/${ns}`)
  }

  const module = await importer()
  return module.default
}

export async function loadNamespace(i18n: I18nInstance, lng: string, ns: I18nNamespace) {
  const locale = normalizeLocale(lng)
  const key = cacheKey(locale, ns)
  if (loaded.has(key)) return
  if (i18n.hasResourceBundle(locale, ns)) {
    loaded.add(key)
    activeNamespaces.add(ns)
    return
  }

  const resource = await loadLocaleResource(locale, ns)
  i18n.addResourceBundle(locale, ns, resource, true, true)
  loaded.add(key)
  activeNamespaces.add(ns)
}

export function getActiveNamespaces(): I18nNamespace[] {
  return [...activeNamespaces]
}

export async function loadNamespaces(i18n: I18nInstance, lng: string, namespaces: I18nNamespace[]) {
  await Promise.all(namespaces.map((ns) => loadNamespace(i18n, lng, ns)))
}

export const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, namespace, callback) {
    loadLocaleResource(language, namespace)
      .then((resource) => callback(null, resource))
      .catch((error) => callback(error, null))
  },
}

/** Reset loaded cache - for tests only */
export function resetNamespaceCache() {
  loaded.clear()
  activeNamespaces.clear()
}
