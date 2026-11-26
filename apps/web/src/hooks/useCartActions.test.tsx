import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import cartReducer from '../features/cart/cartSlice'
import authReducer from '../features/auth/authSlice'
import { useCartActions } from './useCartActions'
import type { CartItem } from '../types'

vi.mock('../features/cart/cartPersistence', () => ({
  loadCartFromStorage: vi.fn(() => null),
  saveCartToStorage: vi.fn(),
  setCartBusinessScope: vi.fn(),
}))

function setup() {
  const store = configureStore({ reducer: { cart: cartReducer, auth: authReducer } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  const { result } = renderHook(() => useCartActions(), { wrapper })
  return { store, result }
}

const item = (productOver: Partial<CartItem['product']> = {}, quantity = 2): CartItem => ({
  productId: 'p1',
  quantity,
  product: {
    id: 'p1',
    supplier_id: 'sup-1',
    sku: 'TOM-1',
    name: 'Tomatoes',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...productOver,
  },
})

describe('useCartActions follow rule', () => {
  it('refuses to add a product of a supplier the restaurant does not follow', () => {
    const { store, result } = setup()
    let outcome: unknown
    act(() => {
      outcome = result.current.addItem(item({ is_followed: false }))
    })
    expect(outcome).toEqual({ ok: false, reason: 'FOLLOW_REQUIRED', supplierId: 'sup-1' })
    expect(store.getState().cart.items).toHaveLength(0)
  })

  it('adds followed products and products without follow info (legacy payloads)', () => {
    const { store, result } = setup()
    act(() => {
      expect(result.current.addItem(item({ is_followed: true }))).toEqual({ ok: true })
    })
    expect(store.getState().cart.items).toHaveLength(1)
  })

  it('blocks raising the quantity of a not-followed line but allows lowering it', () => {
    const { store, result } = setup()
    act(() => {
      result.current.addItem(item({ is_followed: true }, 4))
    })
    act(() => {
      result.current.markSupplierUnfollowed('sup-1')
    })
    act(() => {
      expect(result.current.updateQuantity('p1', 9)).toEqual({
        ok: false,
        reason: 'FOLLOW_REQUIRED',
        supplierId: 'sup-1',
      })
    })
    expect(store.getState().cart.items[0].quantity).toBe(4)
    act(() => {
      expect(result.current.updateQuantity('p1', 2)).toEqual({ ok: true })
    })
    expect(store.getState().cart.items[0].quantity).toBe(2)
  })

  it('markSupplierFollowed re-enables the supplier lines', () => {
    const { store, result } = setup()
    act(() => {
      result.current.addItem(item({ is_followed: true }, 4))
      result.current.markSupplierUnfollowed('sup-1')
    })
    act(() => {
      result.current.markSupplierFollowed('sup-1')
    })
    expect(store.getState().cart.items[0].product.is_followed).toBe(true)
    act(() => {
      expect(result.current.updateQuantity('p1', 8)).toEqual({ ok: true })
    })
  })
})
