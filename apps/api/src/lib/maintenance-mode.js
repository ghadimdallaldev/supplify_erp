import { isPlatformFeatureEnabled } from './feature-flags.js'

/**
 * Maintenance mode: platform flag `platform_access` (default ON). When an admin forces it off,
 * every authenticated non-ADMIN request gets 503 MAINTENANCE_MODE (enforced in requireAuth).
 * Platform admins are never blocked, so they can always reach Admin → Features to turn it back
 * on. Fails open on lookup errors so a cache/DB blip never locks users out.
 *
 * @param {{ role?: string } | null | undefined} user
 */
export async function isPlatformAccessBlocked(user) {
  if (!user || user.role === 'ADMIN') return false
  try {
    return !(await isPlatformFeatureEnabled('platform_access'))
  } catch {
    return false
  }
}

export function maintenanceModeBody(req) {
  return {
    ok: false,
    data: null,
    error: {
      name: 'MAINTENANCE_MODE',
      code: 'MAINTENANCE_MODE',
      message: 'Supplify is temporarily unavailable for maintenance. Please try again soon.',
      featureKey: 'platform_access',
    },
    requestId: req.requestId,
  }
}
