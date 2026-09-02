import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { i18n, changeAppLanguage, getActiveLocale } from './index'
import { DEFAULT_LOCALE, EAGER_NAMESPACES, LAZY_NAMESPACES, LOCALE_STORAGE_KEY } from './config'
import { loadNamespace, resetNamespaceCache } from './loadNamespace'

const enGlob = import.meta.glob('./locales/en/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

const arGlob = import.meta.glob('./locales/ar/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

function namespaceFromPath(path: string) {
  const match = path.match(/\/([^/]+)\.json$/)
  return match?.[1] ?? ''
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  )
}

function flattenStrings(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') {
    return prefix ? { [prefix]: value } : {}
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, child]) => ({
      ...acc,
      ...flattenStrings(child, prefix ? `${prefix}.${key}` : key),
    }),
    {}
  )
}

function interpolationNames(value: string) {
  return Array.from(value.matchAll(/{{\s*([^},\s]+).*?}}/g))
    .map((match) => match[1])
    .sort()
}

function removeLazyResourceBundles() {
  for (const lng of ['en', 'ar']) {
    for (const ns of LAZY_NAMESPACES) {
      if (i18n.hasResourceBundle(lng, ns)) {
        i18n.removeResourceBundle(lng, ns)
      }
    }
  }
}

const ALL_NAMESPACES = [...EAGER_NAMESPACES, ...LAZY_NAMESPACES]

describe('i18n', () => {
  beforeEach(async () => {
    localStorage.clear()
    resetNamespaceCache()
    removeLazyResourceBundles()
    await changeAppLanguage(DEFAULT_LOCALE)
  })

  afterEach(() => {
    localStorage.clear()
    resetNamespaceCache()
    removeLazyResourceBundles()
  })

  it('defaults to en', () => {
    expect(getActiveLocale()).toBe('en')
    expect(i18n.t('actions.save')).toBe('Save')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('initializes with only eager namespaces in the boot resources', () => {
    for (const ns of EAGER_NAMESPACES) {
      expect(i18n.hasResourceBundle('en', ns), `en/${ns}`).toBe(true)
      expect(i18n.hasResourceBundle('ar', ns), `ar/${ns}`).toBe(true)
    }
    for (const ns of LAZY_NAMESPACES) {
      expect(i18n.hasResourceBundle('en', ns), `en/${ns}`).toBe(false)
      expect(i18n.hasResourceBundle('ar', ns), `ar/${ns}`).toBe(false)
    }
  })

  it("changeAppLanguage('ar') sets dir rtl", async () => {
    await changeAppLanguage('ar')
    expect(getActiveLocale()).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    expect(i18n.t('actions.save')).not.toBe('actions.save')
    expect(i18n.t('actions.save')).not.toBe('Save')
  })

  it("changeAppLanguage('en') sets dir ltr", async () => {
    await changeAppLanguage('ar')
    await changeAppLanguage('en')
    expect(getActiveLocale()).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(document.documentElement.lang).toBe('en')
  })

  it('persists locale in localStorage', async () => {
    await changeAppLanguage('ar')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ar')

    await changeAppLanguage('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('falls back to en for missing keys in the active locale', async () => {
    i18n.addResourceBundle('en', 'testFallback', { onlyInEnglish: 'English fallback' }, true, false)
    await changeAppLanguage('ar')
    expect(i18n.t('testFallback:onlyInEnglish')).toBe('English fallback')
  })

  it('returns the key when missing in all locales', () => {
    expect(i18n.t('common:totally.missing.key')).toBe('totally.missing.key')
  })

  it('resolves billingOverdue copy in common namespace', () => {
    expect(i18n.t('billingOverdue.freeTrial.title')).toBe('Free Trial expired')
    expect(i18n.t('billingOverdue.locked.title')).toContain('payment required')
  })

  it('lazy-loads namespaces through i18next for react-i18next consumers', async () => {
    expect(i18n.hasResourceBundle('en', 'auth')).toBe(false)
    await i18n.loadNamespaces('auth')
    expect(i18n.hasResourceBundle('en', 'auth')).toBe(true)
    expect(i18n.t('auth:welcomeBack')).toBe('Welcome back')
  })

  it("loadNamespace('auth') loads auth strings", async () => {
    resetNamespaceCache()
    await loadNamespace(i18n, 'en', 'auth')
    expect(i18n.t('auth:welcomeBack')).toBe('Welcome back')

    resetNamespaceCache()
    await changeAppLanguage('ar')
    await loadNamespace(i18n, 'ar', 'auth')
    expect(i18n.t('auth:welcomeBack')).not.toBe('auth:welcomeBack')
  })

  it("loadNamespace('orders') resolves page tab labels", async () => {
    resetNamespaceCache()
    await loadNamespace(i18n, 'en', 'orders')
    expect(i18n.t('orders:page.tabs.all')).toBe('All Orders')
    expect(i18n.t('orders:page.tabs.processing')).toBe('Processing')
  })

  it('keeps Arabic namespace keys in parity with English', () => {
    for (const ns of ALL_NAMESPACES) {
      const enPath = `./locales/en/${ns}.json`
      const arPath = `./locales/ar/${ns}.json`
      const en = enGlob[enPath]
      const ar = arGlob[arPath]
      expect(en, `missing en locale for ${ns}`).toBeTruthy()
      expect(ar, `missing ar locale for ${ns}`).toBeTruthy()
      expect(flattenKeys(ar).sort(), ns).toEqual(flattenKeys(en).sort())
    }
  })

  it('keeps interpolation placeholders identical between English and Arabic', () => {
    for (const ns of ALL_NAMESPACES) {
      const en = flattenStrings(enGlob[`./locales/en/${ns}.json`])
      const ar = flattenStrings(arGlob[`./locales/ar/${ns}.json`])

      for (const key of Object.keys(en)) {
        expect(interpolationNames(ar[key] ?? ''), `${ns}:${key}`).toEqual(
          interpolationNames(en[key])
        )
      }
    }
  })

  it('has a locale file for every configured namespace', () => {
    const enNames = new Set(Object.keys(enGlob).map(namespaceFromPath))
    const arNames = new Set(Object.keys(arGlob).map(namespaceFromPath))
    for (const ns of ALL_NAMESPACES) {
      expect(enNames.has(ns), `en/${ns}.json`).toBe(true)
      expect(arNames.has(ns), `ar/${ns}.json`).toBe(true)
    }
  })
})
