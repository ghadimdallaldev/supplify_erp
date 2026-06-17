import type { i18n as I18nInstance } from 'i18next'
import type { I18nNamespace } from './config'

const loaded = new Set<string>()

function cacheKey(lng: string, ns: string) {
  return `${lng}:${ns}`
}

export async function loadNamespace(i18n: I18nInstance, lng: string, ns: I18nNamespace) {
  const key = cacheKey(lng, ns)
  if (loaded.has(key)) return

  const module = await import(`./locales/${lng}/${ns}.json`)
  i18n.addResourceBundle(lng, ns, module.default, true, true)
  loaded.add(key)
}

export async function loadNamespaces(i18n: I18nInstance, lng: string, namespaces: I18nNamespace[]) {
  await Promise.all(namespaces.map((ns) => loadNamespace(i18n, lng, ns)))
}

/** Reset loaded cache — for tests only */
export function resetNamespaceCache() {
  loaded.clear()
}
