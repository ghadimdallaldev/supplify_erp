import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
vi.mock('./db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: (fn) => fn({ query: (...a) => mockQuery(...a) }),
}))

describe('driver-user-link', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('linkDriverToUser rejects when user already linked to another driver', async () => {
    const { linkDriverToUser } = await import('./driver-user-link.js')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', user_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // tenant membership
      .mockResolvedValueOnce({ rows: [{ id: 'd-other' }] })

    await expect(
      linkDriverToUser({ driverId: 'd1', userId: 'u1', supplierId: 's1' })
    ).rejects.toThrow(/already linked/)
  })

  it('linkDriverToUser rejects a user who is not a member of the supplier tenant', async () => {
    const { linkDriverToUser } = await import('./driver-user-link.js')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', user_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'u-outsider', email: 'x@other.test' }] })
      .mockResolvedValueOnce({ rows: [] }) // no membership in supplier s1

    await expect(
      linkDriverToUser({ driverId: 'd1', userId: 'u-outsider', supplierId: 's1' })
    ).rejects.toThrow(/member of this supplier/)
    // never reached the UPDATE
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE drivers'))).toBe(false)
  })

  it('linkDriverToUser links a tenant member', async () => {
    const { linkDriverToUser } = await import('./driver-user-link.js')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'd1', user_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [] }) // not linked elsewhere
      .mockResolvedValueOnce({ rows: [{ id: 'd1', user_id: 'u1' }] })

    const row = await linkDriverToUser({ driverId: 'd1', userId: 'u1', supplierId: 's1' })
    expect(row.user_id).toBe('u1')
  })

  it('ensureDriverProfileForUser creates profile when none exists', async () => {
    const { ensureDriverProfileForUser } = await import('./driver-user-link.js')
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ display_name: 'Alex Driver', email: 'a@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'd-new', full_name: 'Alex Driver', user_id: 'u1' }],
      })

    const row = await ensureDriverProfileForUser({
      userId: 'u1',
      supplierId: 's1',
    })
    expect(row.id).toBe('d-new')
  })

  it('syncDriverLinkForRoleAssignment auto-creates for Driver role', async () => {
    const { syncDriverLinkForRoleAssignment } = await import('./driver-user-link.js')
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ display_name: 'Pat', email: 'p@test.com' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'd1', user_id: 'u1' }] })

    const row = await syncDriverLinkForRoleAssignment({
      userId: 'u1',
      supplierId: 's1',
      roleName: 'Driver',
    })
    expect(row?.id).toBe('d1')
  })
})
