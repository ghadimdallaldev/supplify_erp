import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/db.js', () => ({ query: vi.fn() }))
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('../lib/keycloak-admin.js', () => ({
  getKeycloakAdminToken: vi.fn().mockResolvedValue('token'),
  findKeycloakUserByEmail: vi
    .fn()
    .mockResolvedValue({ id: 'kc-1', firstName: 'Chef', lastName: 'User' }),
  resetKeycloakUserPassword: vi.fn().mockResolvedValue(undefined),
  splitNameForKeycloak: vi.fn(() => ({ firstName: 'Chef', lastName: 'User' })),
  updateKeycloakUserProfile: vi.fn().mockResolvedValue(undefined),
}))

import { query } from '../lib/db.js'
import {
  adminResetUserPassword,
  generateAdminResetPassword,
} from './admin-user-password.service.js'

describe('admin-user-password.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockResolvedValue({ rows: [] })
  })

  it('generateAdminResetPassword meets strength rules', () => {
    const p = generateAdminResetPassword()
    expect(p.length).toBeGreaterThanOrEqual(10)
    expect(/[A-Z]/.test(p)).toBe(true)
    expect(/[a-z]/.test(p)).toBe(true)
    expect(/[0-9]/.test(p)).toBe(true)
  })

  it('blocks resetting another admin account', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'u2', email: 'other@supplify.com', display_name: 'Other', role: 'ADMIN' }],
    })
    await expect(
      adminResetUserPassword({
        actorUserId: 'u1',
        targetUserId: undefined,
        email: 'other@supplify.com',
        generate: true,
      })
    ).rejects.toMatchObject({ name: 'FORBIDDEN', status: 403 })
  })

  it('resets password with generated temporary password', async () => {
    query.mockImplementation(async () => ({
      rows: [
        {
          id: 'u3',
          email: 'chef@restaurant.com',
          display_name: 'Chef',
          role: 'RESTAURANT',
        },
      ],
    }))
    const result = await adminResetUserPassword({
      actorUserId: 'admin-1',
      targetUserId: 'u3',
      generate: true,
    })
    expect(result.temporaryPassword).toBeTruthy()
    expect(result.temporary).toBe(true)
  })
})
