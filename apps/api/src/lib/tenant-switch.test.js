import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args) => query(...args),
}))

vi.mock('../config/env.js', () => ({
  config: { IMPERSONATION_SECRET: 'test-secret-key-at-least-32-chars!!', NODE_ENV: 'test' },
}))

vi.mock('./logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock('./impersonation.js', () => ({
  getEffectiveTenant: vi.fn(() => null),
  impersonationCanAccessBranch: vi.fn(),
}))

function mockQuerySequence(handlers) {
  let i = 0
  query.mockImplementation(async (sql) => {
    const handler = handlers[i++]
    if (!handler) {
      throw new Error(`Unexpected query #${i}: ${String(sql).slice(0, 80)}`)
    }
    if (typeof handler === 'function') return handler(sql)
    return handler
  })
}

/** Shared prefix: active tenant, no role/workspace/primary (primary uses two queries). */
function noDirectAccessPrefix() {
  return [
    { rows: [{ is_branch_active: true }] },
    { rows: [] }, // user_role
    { rows: [] }, // tenant_user_roles
    { rows: [] }, // workspace
    { rows: [] }, // primary tenant (not linked child)
    { rows: [] }, // primary tenant fallback by email
  ]
}

describe('userCanAccessTenant', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('denies access to deactivated Branch Accounts', async () => {
    const { userCanAccessTenant } = await import('./tenant-switch.js')
    mockQuerySequence([{ rows: [{ is_branch_active: false }] }])
    const allowed = await userCanAccessTenant('u1', 'a@b.com', 'r1', 'RESTAURANT')
    expect(allowed).toBe(false)
  })

  it('allows restaurant org owner access to sibling Branch Account', async () => {
    const { userCanAccessTenant } = await import('./tenant-switch.js')
    mockQuerySequence([
      ...noDirectAccessPrefix(),
      { rows: [{ organization_id: 'org-1' }] },
      { rows: [{ name: 'Org Owner', branch_scope: 'all' }] },
    ])
    const allowed = await userCanAccessTenant('u1', 'a@b.com', 'r2', 'RESTAURANT')
    expect(allowed).toBe(true)
  })

  it('denies restaurant Regional Manager without branch assignment', async () => {
    const { userCanAccessTenant } = await import('./tenant-switch.js')
    mockQuerySequence([
      ...noDirectAccessPrefix(),
      { rows: [{ organization_id: 'org-1' }] },
      { rows: [{ name: 'Regional Manager', branch_scope: 'assigned' }] },
      { rows: [] }, // no assignment
    ])
    const allowed = await userCanAccessTenant('u1', 'a@b.com', 'r2', 'RESTAURANT')
    expect(allowed).toBe(false)
  })

  it('allows restaurant Regional Manager with branch assignment', async () => {
    const { userCanAccessTenant } = await import('./tenant-switch.js')
    mockQuerySequence([
      ...noDirectAccessPrefix(),
      { rows: [{ organization_id: 'org-1' }] },
      { rows: [{ name: 'Regional Manager', branch_scope: 'assigned' }] },
      { rows: [{ '?column?': 1 }] },
    ])
    const allowed = await userCanAccessTenant('u1', 'a@b.com', 'r2', 'RESTAURANT')
    expect(allowed).toBe(true)
  })

  it('denies supplier org access to detached Branch Account (no organization_id)', async () => {
    const { userCanAccessTenant } = await import('./tenant-switch.js')
    mockQuerySequence([...noDirectAccessPrefix(), { rows: [{ organization_id: null }] }])
    const allowed = await userCanAccessTenant('u1', 'a@b.com', 's2', 'SUPPLIER')
    expect(allowed).toBe(false)
  })

  it('denies supplier sibling when user has no org role', async () => {
    const { userCanAccessTenant } = await import('./tenant-switch.js')
    mockQuerySequence([
      ...noDirectAccessPrefix(),
      { rows: [{ organization_id: 'org-1' }] },
      { rows: [] },
    ])
    const allowed = await userCanAccessTenant('u1', 'a@b.com', 's2', 'SUPPLIER')
    expect(allowed).toBe(false)
  })

  it('allows direct tenant_user_roles membership even without org role', async () => {
    const { userCanAccessTenant } = await import('./tenant-switch.js')
    mockQuerySequence([
      { rows: [{ is_branch_active: true }] },
      { rows: [] },
      { rows: [{ '?column?': 1 }] },
    ])
    const allowed = await userCanAccessTenant('u1', 'a@b.com', 'r1', 'RESTAURANT')
    expect(allowed).toBe(true)
  })
})
