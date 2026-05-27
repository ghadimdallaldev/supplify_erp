import { query } from './db.js'

const DEFAULTS = {
  free_sandbox_days: 7,
}

export async function getPlatformSetting(key, fallback = null) {
  try {
    const { rows } = await query(`SELECT value FROM platform_setting WHERE key = $1`, [key])
    if (!rows.length) {
      return fallback !== null ? fallback : DEFAULTS[key] ?? null
    }
    const raw = rows[0].value
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string') {
      const n = Number(raw)
      return Number.isFinite(n) ? n : raw
    }
    return raw
  } catch (e) {
    if (e.code === '42P01') return fallback !== null ? fallback : DEFAULTS[key] ?? null
    throw e
  }
}

export async function setPlatformSetting(key, value) {
  await query(
    `INSERT INTO platform_setting (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  )
}

export async function getFreeSandboxDays() {
  const days = Number(await getPlatformSetting('free_sandbox_days', DEFAULTS.free_sandbox_days))
  if (!Number.isFinite(days)) return DEFAULTS.free_sandbox_days
  return Math.min(30, Math.max(1, Math.round(days)))
}
