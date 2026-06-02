import { describe, expect, it, vi, beforeEach } from 'vitest'

const query = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => query(...args),
}))

vi.mock('../config/supplifyModel.js', () => ({
  isSupplifyV2: vi.fn(),
}))

import { isSupplifyV2 } from '../config/supplifyModel.js'
import { assertBuyerCanOrderFromSuppliers } from './restaurant-workspace.js'

describe('assertBuyerCanOrderFromSuppliers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no-ops on V1', async () => {
    isSupplifyV2.mockReturnValue(false)
    await expect(assertBuyerCanOrderFromSuppliers('r1', ['supplier-1'])).resolves.toBeUndefined()
    expect(query).not.toHaveBeenCalled()
  })

  it('throws when buyer_only and supplier not linked', async () => {
    isSupplifyV2.mockReturnValue(true)
    query
      .mockResolvedValueOnce({ rows: [{ workspace_mode: 'buyer_only' }] })
      .mockResolvedValueOnce({ rows: [] })

    await expect(assertBuyerCanOrderFromSuppliers('r1', ['supplier-1'])).rejects.toMatchObject({
      code: 'SUPPLIER_NOT_LINKED',
    })
  })

  it('passes when buyer_only and supplier linked', async () => {
    isSupplifyV2.mockReturnValue(true)
    query
      .mockResolvedValueOnce({ rows: [{ workspace_mode: 'buyer_only' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })

    await expect(assertBuyerCanOrderFromSuppliers('r1', ['supplier-1'])).resolves.toBeUndefined()
  })
})
