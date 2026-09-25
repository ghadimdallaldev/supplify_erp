import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  queryMock,
  clientQuery,
  notifyTenantUsersMock,
  notifyAmendmentMock,
  proposeMock,
  conversationMock,
  messageMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQuery: vi.fn(),
  notifyTenantUsersMock: vi.fn(),
  notifyAmendmentMock: vi.fn(),
  proposeMock: vi.fn(),
  conversationMock: vi.fn(),
  messageMock: vi.fn(),
}))

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: async (fn) => fn({ query: clientQuery }),
}))

vi.mock('../lib/chat-conversation.js', () => ({
  getOrCreateConversation: (...args) => conversationMock(...args),
  postConversationMessage: (...args) => messageMock(...args),
}))

vi.mock('./notification.service.js', () => ({
  notifyTenantUsers: (...args) => notifyTenantUsersMock(...args),
}))

vi.mock('./order-amendments.service.js', () => ({
  canAmendOrderStatus: () => true,
  getOrderForAmendment: async () => ({
    id: 'o1',
    status: 'PROCESSING',
    restaurant_id: 'r1',
    supplier_id: 's1',
  }),
  notifyAmendmentParty: (...args) => notifyAmendmentMock(...args),
}))

vi.mock('./product-substitutes.service.js', () => ({
  proposeOrderSubstitution: (...args) => proposeMock(...args),
}))

import {
  buildShortageMessage,
  createSubstitutionIssue,
} from './order-fulfillment-issues.service.js'

describe('order-fulfillment-issues', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds structured shortage message from order data', () => {
    const msg = buildShortageMessage({
      productName: 'Rice 1kg',
      orderedQuantity: 5,
      orderedUnit: 'bag',
      availableQuantity: 1,
      availableUnit: 'bag',
      replacementProductName: 'Rice 5kg',
      replacementQuantity: 1,
      replacementUnit: 'bag',
    })
    expect(msg).toContain('5 bag')
    expect(msg).toContain('Rice 1kg')
    expect(msg).toContain('1 bag')
    expect(msg).toContain('Rice 5kg')
    expect(msg).toContain('Do you want us to proceed')
  })

  it('commits the substitution amendment and issue together, then notifies', async () => {
    const events = []
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM product')) {
        return { rows: [{ name: 'Wheat', unit: 'kg', supplier_id: 's1' }] }
      }
      return {
        rows: [
          {
            id: 'oi1',
            quantity: 4,
            product_name: 'Rice',
            product_unit: 'kg',
            restaurant_id: 'r1',
          },
        ],
      }
    })
    conversationMock.mockImplementation(async () => {
      events.push('conversation')
      return { id: 'conv-1' }
    })
    proposeMock.mockImplementation(async ({ client, skipNotify }) => {
      events.push(`amendment:${skipNotify}:${Boolean(client)}`)
      return {
        amendmentId: 'am-1',
        amendment: { id: 'am-1', description: 'swap', requested_by_role: 'supplier' },
      }
    })
    messageMock.mockImplementation(async ({ client }) => {
      events.push(`message:${Boolean(client)}`)
      return { id: 'msg-1' }
    })
    clientQuery.mockImplementation(async (sql) => {
      events.push(String(sql).includes('order_fulfillment_issue') ? 'issue' : 'other-sql')
      return { rows: [{ id: 'issue-1' }] }
    })
    notifyTenantUsersMock.mockImplementation(async () => {
      events.push('notify-issue')
    })
    notifyAmendmentMock.mockImplementation(async () => {
      events.push('notify-amendment')
    })

    const result = await createSubstitutionIssue({
      orderId: 'o1',
      supplierId: 's1',
      orderItemId: 'oi1',
      createdByUserId: 'u1',
      substituteProductId: 'p2',
    })

    expect(result.issue.id).toBe('issue-1')
    expect(result.amendment.amendmentId).toBe('am-1')
    expect(events).toEqual([
      'conversation',
      'amendment:true:true',
      'message:true',
      'issue',
      'notify-issue',
      'notify-amendment',
    ])
  })

  it('does not notify when the substitution transaction fails', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 'oi1',
          quantity: 4,
          product_name: 'Rice',
          product_unit: 'kg',
          restaurant_id: 'r1',
          name: 'Wheat',
          unit: 'kg',
          supplier_id: 's1',
        },
      ],
    })
    conversationMock.mockResolvedValue({ id: 'conv-1' })
    proposeMock.mockResolvedValue({
      amendmentId: 'am-1',
      amendment: { id: 'am-1', requested_by_role: 'supplier' },
    })
    messageMock.mockResolvedValue({ id: 'msg-1' })
    clientQuery.mockRejectedValue(new Error('issue insert failed'))

    await expect(
      createSubstitutionIssue({
        orderId: 'o1',
        supplierId: 's1',
        orderItemId: 'oi1',
        createdByUserId: 'u1',
        substituteProductId: 'p2',
      })
    ).rejects.toThrow(/issue insert failed/)
    expect(notifyTenantUsersMock).not.toHaveBeenCalled()
    expect(notifyAmendmentMock).not.toHaveBeenCalled()
  })
})
