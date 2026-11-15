import { QueryClient } from '@tanstack/react-query'
import { businessSessionKey, resetBusinessSession } from './sessionIsolation'
import { getRequestScopeVersion } from './requestScope'
import { useCartStore } from '../../store/cartStore'
import type { User } from '../../types/supplify'

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'attempt-a') }))
jest.mock('../../services/chatSocket', () => ({ disconnectChatSocket: jest.fn() }))

describe('business session isolation', () => {
  it('discards cached orders, cart and pending checkout before a new session', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    })
    client.setQueryData(['orders'], { orders: [{ id: 'private-order-a' }] })
    useCartStore
      .getState()
      .addItem({ id: 'p', supplier_id: 's', sku: 'P', name: 'Private price', current_price: 10 })
    useCartStore.getState().beginCheckout({ items: [{ productId: 'p', quantity: 1 }] })
    let finish!: (value: unknown) => void
    const pending = client
      .fetchQuery({
        queryKey: ['slow-orders'],
        queryFn: () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      })
      .catch(() => {})
    const previousScope = getRequestScopeVersion()

    resetBusinessSession(client)
    finish({ orders: [{ id: 'late-order-a' }] })
    await pending

    expect(getRequestScopeVersion()).toBeGreaterThan(previousScope)
    expect(client.getQueryData(['orders'])).toBeUndefined()
    expect(client.getQueryData(['slow-orders'])).toBeUndefined()
    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().checkoutAttempt).toBeNull()
    client.clear()
  })

  it('distinguishes accounts, roles and workspaces without including credentials', () => {
    const user = { id: 'a', role: 'RESTAURANT', workspace: { tenantId: 'one' } } as User
    expect(businessSessionKey(user)).not.toBe(businessSessionKey({ ...user, id: 'b' }))
    expect(businessSessionKey(user)).not.toBe(
      businessSessionKey({ ...user, workspace: { ...user.workspace!, tenantId: 'two' } })
    )
    expect(businessSessionKey(null)).toBeNull()
  })
})
