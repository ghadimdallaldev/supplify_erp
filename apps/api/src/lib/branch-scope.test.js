import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => query(...args),
}))

describe('assertLegacyBranchOwnedByRestaurant', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('allows a null branch id', async () => {
    const { assertLegacyBranchOwnedByRestaurant } = await import('./branch-scope.js')
    await expect(assertLegacyBranchOwnedByRestaurant(null, 'r1')).resolves.toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects a branch that is not owned by the restaurant', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    const { assertLegacyBranchOwnedByRestaurant } = await import('./branch-scope.js')
    await expect(assertLegacyBranchOwnedByRestaurant('b-foreign', 'r1')).rejects.toMatchObject({
      message: 'Branch not found for this restaurant',
    })
  })

  it('rejects when any id in a batch is not owned', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'b1' }] })
    const { assertLegacyBranchesOwnedByRestaurant } = await import('./branch-scope.js')
    await expect(
      assertLegacyBranchesOwnedByRestaurant(['b1', 'b-foreign'], 'r1')
    ).rejects.toMatchObject({
      message: 'One or more branches are not part of this restaurant',
    })
  })
})
