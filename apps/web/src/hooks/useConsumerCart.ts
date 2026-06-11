import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildCartKey,
  cartTotals,
  clearCartStorage,
  loadCart,
  saveCart,
  type CartLine,
} from '../lib/consumerCart'

export type AddCartLineInput = {
  menuItemId: string
  name: string
  unitPrice: number
  modifierOptionIds?: string[]
  notes?: string
  quantity?: number
}

export function useConsumerCart(slug: string) {
  const [cart, setCart] = useState<CartLine[]>(() => loadCart(slug))

  useEffect(() => {
    setCart(loadCart(slug))
  }, [slug])

  const persist = useCallback(
    (next: CartLine[]) => {
      saveCart(slug, next)
      setCart(next)
    },
    [slug]
  )

  const addLine = useCallback(
    (input: AddCartLineInput) => {
      if (!slug) return
      const modifierOptionIds = input.modifierOptionIds ?? []
      const notes = input.notes?.trim() || undefined
      const cartKey = buildCartKey(input.menuItemId, modifierOptionIds, notes)
      const quantity = input.quantity ?? 1

      setCart((prev) => {
        const existing = prev.find((line) => line.cartKey === cartKey)
        const next = existing
          ? prev.map((line) =>
              line.cartKey === cartKey ? { ...line, quantity: line.quantity + quantity } : line
            )
          : [
              ...prev,
              {
                cartKey,
                menuItemId: input.menuItemId,
                name: input.name,
                unitPrice: input.unitPrice,
                quantity,
                modifierOptionIds,
                notes,
              },
            ]
        saveCart(slug, next)
        return next
      })
    },
    [slug]
  )

  const updateQuantity = useCallback(
    (cartKey: string, quantity: number) => {
      if (!slug) return
      setCart((prev) => {
        const next =
          quantity <= 0
            ? prev.filter((line) => line.cartKey !== cartKey)
            : prev.map((line) => (line.cartKey === cartKey ? { ...line, quantity } : line))
        saveCart(slug, next)
        return next
      })
    },
    [slug]
  )

  const removeLine = useCallback(
    (cartKey: string) => {
      if (!slug) return
      setCart((prev) => {
        const next = prev.filter((line) => line.cartKey !== cartKey)
        saveCart(slug, next)
        return next
      })
    },
    [slug]
  )

  const clearCart = useCallback(() => {
    clearCartStorage(slug)
    setCart([])
  }, [slug])

  const { count: cartCount, total: cartTotal } = useMemo(() => cartTotals(cart), [cart])

  return {
    cart,
    cartCount,
    cartTotal,
    addLine,
    updateQuantity,
    removeLine,
    clearCart,
    persist,
  }
}
