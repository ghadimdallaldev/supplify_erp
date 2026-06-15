import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../config/env.js', () => ({
  config: {
    SESSION_SECRET: 'test-session-secret',
  },
}))

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./rbac.js', () => ({
  getSupplierIdForRequest: vi.fn(),
  getRestaurantIdForRequest: vi.fn(),
}))

import { query } from './db.js'
import { signObjectAccessParams, verifyObjectAccess } from './object-download-auth.js'

describe('object-download-auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signObjectAccessParams produces verifiable sig/exp pair', async () => {
    const key = 'uploads/user-1/file.jpg'
    const { exp, sig } = signObjectAccessParams(key, 3600)
    const req = { query: { exp, sig } }
    expect(await verifyObjectAccess(key, req)).toBe(true)
  })

  it('allows authenticated user to read own upload prefix', async () => {
    const key = 'uploads/user-1/file.jpg'
    const req = { query: {}, userData: { id: 'user-1', role: 'RESTAURANT' } }
    expect(await verifyObjectAccess(key, req)).toBe(true)
  })

  it('allows public catalog product images without auth', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ public_catalog_enabled: true }] })
    const key = 'uploads/supplier-1/products/prod-1/main.webp'
    expect(await verifyObjectAccess(key, { query: {} })).toBe(true)
  })

  it('denies unknown keys without auth or signature', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ public_catalog_enabled: false }] })
    const key = 'uploads/supplier-1/products/prod-1/main.webp'
    expect(await verifyObjectAccess(key, { query: {} })).toBe(false)
  })
})
