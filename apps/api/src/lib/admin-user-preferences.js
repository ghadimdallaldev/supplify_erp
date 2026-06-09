import { query } from './db.js'

export const ADMIN_LANDING_TABS = [
  'overview',
  'activity',
  'tenants',
  'users',
  'subscriptions',
  'plans',
  'finance',
  'usage',
  'features',
  'deals',
  'limits',
  'operations',
  'health',
  'audit',
]

export const ADMIN_THEME_PREFERENCES = ['light', 'dark', 'system']

const DEFAULTS = {
  defaultLandingTab: 'overview',
  compactMode: false,
  themePreference: 'system',
}

function mapRow(row) {
  if (!row) return { ...DEFAULTS }
  return {
    defaultLandingTab: ADMIN_LANDING_TABS.includes(row.default_landing_tab)
      ? row.default_landing_tab
      : DEFAULTS.defaultLandingTab,
    compactMode: Boolean(row.compact_mode),
    themePreference: ADMIN_THEME_PREFERENCES.includes(row.theme_preference)
      ? row.theme_preference
      : DEFAULTS.themePreference,
  }
}

export async function getAdminUserPreferences(userId) {
  const { rows } = await query(
    `SELECT default_landing_tab, compact_mode, theme_preference
     FROM admin_user_preferences
     WHERE user_id = $1`,
    [userId]
  )
  return mapRow(rows[0])
}

export async function upsertAdminUserPreferences(userId, input) {
  const current = await getAdminUserPreferences(userId)
  const landingTab = ADMIN_LANDING_TABS.includes(input.defaultLandingTab)
    ? input.defaultLandingTab
    : current.defaultLandingTab
  const theme = ADMIN_THEME_PREFERENCES.includes(input.themePreference)
    ? input.themePreference
    : current.themePreference
  const compactMode =
    input.compactMode !== undefined ? Boolean(input.compactMode) : current.compactMode

  await query(
    `INSERT INTO admin_user_preferences (user_id, default_landing_tab, compact_mode, theme_preference)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       default_landing_tab = EXCLUDED.default_landing_tab,
       compact_mode = EXCLUDED.compact_mode,
       theme_preference = EXCLUDED.theme_preference,
       updated_at = now()`,
    [userId, landingTab, compactMode, theme]
  )

  return getAdminUserPreferences(userId)
}
