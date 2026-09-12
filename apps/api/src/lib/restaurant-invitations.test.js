import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expireOldRestaurantInvitations } from './restaurant-invitations.js'

const queryMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: async (fn) => fn({ query: (...args) => queryMock(...args) }),
}))

vi.mock('./keycloak-admin.js', () => ({
  createKeycloakUserWithPassword: vi.fn(),
}))

vi.mock('../services/invitation-mail.service.js', () => ({
  sendTeamInvitationEmail: vi.fn(),
}))

describe('expireOldRestaurantInvitations', () => {
  beforeEach(() => {
    queryMock.mockReset()
  })

  it('expires pending invitations past expires_at', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 3 })
    const count = await expireOldRestaurantInvitations()
    expect(count).toBe(3)
    expect(queryMock.mock.calls[0][0]).toContain('restaurant_invitations')
    expect(queryMock.mock.calls[0][0]).toContain("status = 'expired'")
  })
})
