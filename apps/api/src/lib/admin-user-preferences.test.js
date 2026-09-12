import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAdminUserPreferences,
  upsertAdminUserPreferences,
  ADMIN_LANDING_TABS,
} from './admin-user-preferences.js'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

import { query } from './db.js'

describe('admin-user-preferences', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('returns defaults when no row exists', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [] })

    const prefs = await getAdminUserPreferences('user-1')

    expect(prefs).toEqual({
      defaultLandingTab: 'overview',
      compactMode: false,
      themePreference: 'system',
    })
  })

  it('maps stored row to camelCase preferences', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          default_landing_tab: 'finance',
          compact_mode: true,
          theme_preference: 'dark',
        },
      ],
    })

    const prefs = await getAdminUserPreferences('user-1')

    expect(prefs).toEqual({
      defaultLandingTab: 'finance',
      compactMode: true,
      themePreference: 'dark',
    })
  })

  it('merges partial updates with existing preferences', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [
          {
            default_landing_tab: 'overview',
            compact_mode: false,
            theme_preference: 'system',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            default_landing_tab: 'overview',
            compact_mode: true,
            theme_preference: 'system',
          },
        ],
      })

    const prefs = await upsertAdminUserPreferences('user-1', { compactMode: true })

    expect(prefs.compactMode).toBe(true)
    expect(prefs.defaultLandingTab).toBe('overview')
    expect(prefs.themePreference).toBe('system')
    expect(ADMIN_LANDING_TABS).toContain(prefs.defaultLandingTab)
  })
})
