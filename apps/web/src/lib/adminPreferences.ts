export type AdminLandingTab =
  | 'overview'
  | 'activity'
  | 'tenants'
  | 'users'
  | 'subscriptions'
  | 'plans'
  | 'finance'
  | 'usage'
  | 'features'
  | 'deals'
  | 'limits'
  | 'operations'
  | 'health'
  | 'audit'

export type AdminThemePreference = 'light' | 'dark' | 'system'

export interface AdminUserPreferences {
  defaultLandingTab: AdminLandingTab
  compactMode: boolean
  themePreference: AdminThemePreference
}

export const DEFAULT_ADMIN_PREFERENCES: AdminUserPreferences = {
  defaultLandingTab: 'overview',
  compactMode: false,
  themePreference: 'system',
}

export const ADMIN_LANDING_TAB_OPTIONS: Array<{ value: AdminLandingTab; label: string }> = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'tenants', label: 'Tenants' },
  { value: 'users', label: 'Users' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'plans', label: 'Plans' },
  { value: 'finance', label: 'Finance' },
  { value: 'usage', label: 'Usage' },
  { value: 'features', label: 'Features' },
  { value: 'deals', label: 'Deals & Boosts' },
  { value: 'limits', label: 'Limits' },
  { value: 'operations', label: 'Operations' },
  { value: 'health', label: 'Health' },
  { value: 'audit', label: 'Audit' },
]

export const ADMIN_THEME_OPTIONS: Array<{ value: AdminThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function resolveDarkMode(themePreference: AdminThemePreference): boolean {
  if (themePreference === 'dark') return true
  if (themePreference === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyAdminPreferences(preferences: AdminUserPreferences): void {
  const root = document.documentElement
  const useDark = resolveDarkMode(preferences.themePreference)
  root.classList.toggle('dark', useDark)
  root.dataset.adminCompact = preferences.compactMode ? 'true' : 'false'
}

export function clearAdminPreferences(): void {
  const root = document.documentElement
  root.classList.remove('dark')
  delete root.dataset.adminCompact
}
