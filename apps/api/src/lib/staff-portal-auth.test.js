import { describe, expect, it } from 'vitest'
import {
  STAFF_PORTAL_APP_ROLE,
  assertStaffPortalRouteAccess,
  hasPlatformAppAccess,
  isStaffPortalAllowedRequest,
  isStaffPortalOnlyUser,
} from './staff-portal-auth.js'

describe('staff-portal-auth', () => {
  it('identifies staff-portal-only users', () => {
    expect(isStaffPortalOnlyUser({ role: STAFF_PORTAL_APP_ROLE })).toBe(true)
    expect(isStaffPortalOnlyUser({ role: 'RESTAURANT' })).toBe(false)
  })

  it('allows platform access for non-staff roles', () => {
    expect(hasPlatformAppAccess({ role: 'RESTAURANT' })).toBe(true)
    expect(hasPlatformAppAccess({ role: STAFF_PORTAL_APP_ROLE })).toBe(false)
  })

  it('allows staff portal users only on whitelisted paths', () => {
    const req = { originalUrl: '/api/staff/self/dashboard', path: '/dashboard' }
    expect(isStaffPortalAllowedRequest(req)).toBe(true)
    expect(isStaffPortalAllowedRequest({ originalUrl: '/api/staff/members' })).toBe(false)
    expect(isStaffPortalAllowedRequest({ originalUrl: '/auth/me' })).toBe(true)
  })

  it('blocks staff portal users from admin APIs', () => {
    const user = { role: STAFF_PORTAL_APP_ROLE }
    const blocked = assertStaffPortalRouteAccess(
      { originalUrl: '/api/orders', requestId: 'r1' },
      user
    )
    expect(blocked?.status).toBe(403)
    expect(blocked?.body.error.name).toBe('STAFF_PORTAL_FORBIDDEN')

    const allowed = assertStaffPortalRouteAccess(
      { originalUrl: '/api/staff/self/pto', requestId: 'r2' },
      user
    )
    expect(allowed).toBeNull()
  })
})
