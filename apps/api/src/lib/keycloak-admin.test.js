import { describe, expect, it } from 'vitest'
import { buildDriverLoginUserUpdate } from './keycloak-admin.js'

describe('buildDriverLoginUserUpdate', () => {
  it('preserves Keycloak identity fields while updating server-owned attributes', () => {
    const existing = {
      username: 'driver@example.com',
      email: 'driver@example.com',
      firstName: 'Delivery',
      lastName: 'Driver',
      enabled: true,
      emailVerified: true,
      attributes: { preferred_locale: ['en'] },
    }
    const attributes = {
      ...existing.attributes,
      supplify_driver_login: ['true'],
    }

    expect(buildDriverLoginUserUpdate(existing, attributes)).toEqual({
      username: 'driver@example.com',
      email: 'driver@example.com',
      firstName: 'Delivery',
      lastName: 'Driver',
      enabled: true,
      emailVerified: true,
      attributes,
    })
  })
})
