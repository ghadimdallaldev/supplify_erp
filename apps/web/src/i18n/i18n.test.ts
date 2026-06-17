import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { i18n, changeAppLanguage, getActiveLocale } from './index'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from './config'
import { loadNamespace, resetNamespaceCache } from './loadNamespace'
import enAuth from './locales/en/auth.json'
import arAuth from './locales/ar/auth.json'
import enCommon from './locales/en/common.json'
import arCommon from './locales/ar/common.json'
import enNavigation from './locales/en/navigation.json'
import arNavigation from './locales/ar/navigation.json'
import enSettings from './locales/en/settings.json'
import arSettings from './locales/ar/settings.json'

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  )
}

describe('i18n', () => {
  beforeEach(async () => {
    localStorage.clear()
    resetNamespaceCache()
    await changeAppLanguage(DEFAULT_LOCALE)
  })

  afterEach(() => {
    localStorage.clear()
    resetNamespaceCache()
  })

  it('defaults to en', () => {
    expect(getActiveLocale()).toBe('en')
    expect(i18n.t('actions.save')).toBe('Save')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it("changeAppLanguage('ar') sets dir rtl", async () => {
    await changeAppLanguage('ar')
    expect(getActiveLocale()).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
    expect(i18n.t('actions.save')).toBe('حفظ')
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

  it("loadNamespace('auth') loads auth strings", async () => {
    resetNamespaceCache()
    await loadNamespace(i18n, 'en', 'auth')
    expect(i18n.t('auth:welcomeBack')).toBe('Welcome back')

    resetNamespaceCache()
    await changeAppLanguage('ar')
    await loadNamespace(i18n, 'ar', 'auth')
    expect(i18n.t('auth:welcomeBack')).toBe('مرحباً بعودتك')
  })

  it('keeps Arabic namespace keys in parity with English', () => {
    const namespaces = [
      ['common', enCommon, arCommon],
      ['navigation', enNavigation, arNavigation],
      ['auth', enAuth, arAuth],
      ['settings', enSettings, arSettings],
    ] as const

    for (const [namespace, en, ar] of namespaces) {
      expect(flattenKeys(ar).sort(), namespace).toEqual(flattenKeys(en).sort())
    }
  })
})
