import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  applyAdminPreferences,
  clearAdminPreferences,
  DEFAULT_ADMIN_PREFERENCES,
} from './adminPreferences'

describe('adminPreferences', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    delete document.documentElement.dataset.adminCompact
  })

  afterEach(() => {
    clearAdminPreferences()
  })

  it('applies dark theme when preference is dark', () => {
    applyAdminPreferences({ ...DEFAULT_ADMIN_PREFERENCES, themePreference: 'dark' })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark theme when preference is light', () => {
    document.documentElement.classList.add('dark')
    applyAdminPreferences({ ...DEFAULT_ADMIN_PREFERENCES, themePreference: 'light' })
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('sets compact mode data attribute', () => {
    applyAdminPreferences({
      ...DEFAULT_ADMIN_PREFERENCES,
      compactMode: true,
      themePreference: 'light',
    })
    expect(document.documentElement.dataset.adminCompact).toBe('true')
  })

  it('clears admin preference side effects', () => {
    applyAdminPreferences({
      ...DEFAULT_ADMIN_PREFERENCES,
      themePreference: 'dark',
      compactMode: true,
    })
    clearAdminPreferences()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.dataset.adminCompact).toBeUndefined()
  })
})
