import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockGetLinkedDriverId = vi.fn()

vi.mock('../lib/db.js', () => ({ query: (...args) => mockQuery(...args) }))
vi.mock('../lib/ai/index.js', () => ({ getAiProvider: vi.fn(() => null) }))
vi.mock('../lib/ai-platform.js', () => ({
  isAiEnvEnabled: vi.fn(() => false),
  isAiAssistantEnabledForTenant: vi.fn(async () => false),
}))
vi.mock('../lib/subscription.js', () => ({
  reserveAiUsage: vi.fn(),
  refundReservedAiUsage: vi.fn(),
  getAiUsageSummary: vi.fn(),
}))
vi.mock('../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('./assistant-tools/index.js', () => ({
  resolveAvailableTools: vi.fn(async () => ({ names: [], definitions: [] })),
  executeAssistantTool: vi.fn(),
}))
vi.mock('../lib/driver-rbac.js', () => ({
  getLinkedDriverId: (...args) => mockGetLinkedDriverId(...args),
}))
vi.mock('../lib/impersonation.js', () => ({ isImpersonating: vi.fn(() => false) }))

const { buildAssistantContext, createConversation, listConversations, listMessages } = await import(
  './assistant-chat.service.js'
)

const ctx = {
  tenantId: 'tenant-allowed',
  tenantType: 'RESTAURANT',
  userId: 'user-1',
  permissions: ['INVENTORY_VIEW'],
  roles: ['Purchaser'],
  isAdmin: false,
  isImpersonating: false,
  driverId: null,
  preferredLocale: 'en',
}

describe('assistant tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockReset()
  })

  it('builds context only from authenticated tenant state, never body or query tenant ids', async () => {
    const result = await buildAssistantContext({
      userData: { id: 'user-1', role: 'RESTAURANT', preferred_locale: 'en' },
      tenantContext: {
        tenantId: 'tenant-allowed',
        tenantType: 'RESTAURANT',
        permissions: ['INVENTORY_VIEW'],
        roles: ['Purchaser'],
      },
      body: { tenantId: 'tenant-attacker', tenantType: 'SUPPLIER' },
      query: { tenantId: 'tenant-attacker' },
    })

    expect(result).toMatchObject({
      tenantId: 'tenant-allowed',
      tenantType: 'RESTAURANT',
      userId: 'user-1',
    })
    expect(result.tenantId).not.toBe('tenant-attacker')
  })

  it('scopes conversation listing and creation by tenant, type, and authenticated user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'conversation-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'conversation-2', title: 'Scoped' }] })

    await listConversations(ctx, { limit: 10, offset: 2 })
    await createConversation(ctx, { title: 'Scoped' })

    expect(mockQuery.mock.calls[0][0]).toContain('tenant_id = $2')
    expect(mockQuery.mock.calls[0][0]).toContain('tenant_type = $3')
    expect(mockQuery.mock.calls[0][1]).toEqual(['user-1', 'tenant-allowed', 'RESTAURANT', 10, 2])
    expect(mockQuery.mock.calls[1][1]).toEqual(['tenant-allowed', 'RESTAURANT', 'user-1', 'Scoped'])
  })

  it('returns not found before reading messages from another tenant conversation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await expect(listMessages(ctx, 'conversation-other-tenant')).rejects.toMatchObject({
      name: 'NotFoundError',
    })

    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0][1]).toEqual([
      'conversation-other-tenant',
      'user-1',
      'tenant-allowed',
      'RESTAURANT',
    ])
  })
})
