import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { i18n, changeAppLanguage, getActiveLocale } from './index'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from './config'
import { loadNamespace, resetNamespaceCache } from './loadNamespace'

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
    i18n.addResourceBundle('en', 'common', { onlyInEnglish: 'English fallback' }, true, false)
    await changeAppLanguage('ar')
    expect(i18n.t('common:onlyInEnglish')).toBe('English fallback')
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
})
