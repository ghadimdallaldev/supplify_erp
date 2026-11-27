import { useCallback } from 'react'
import { useStore } from 'react-redux'
import { useAppDispatch, useAppSelector } from './redux'
import {
  addItem as addItemAction,
  removeItem as removeItemAction,
  updateQuantity as updateQuantityAction,
  clearCart as clearCartAction,
  saveDraft as saveDraftAction,
  loadDraft as loadDraftAction,
  deleteDraft as deleteDraftAction,
  rehydrateCart as rehydrateCartAction,
  setSupplierFollowState,
} from '../features/cart/cartSlice'
import type { CartItem } from '../types'

type CartStateShape = { cart: { items: CartItem[] } }

export type CartChangeResult =
  | { ok: true }
  | { ok: false; reason: 'FOLLOW_REQUIRED'; supplierId: string }

/** A product can go in the cart only when its supplier is followed (spec §10 Q1). */
function blockedByFollow(product: CartItem['product'] | undefined) {
  return product?.is_followed === false || product?.can_order === false
}

/**
 * Cart mutations with localStorage persistence keyed by signed-in user.
 *
 * The single choke point for the follow rule: `addItem` refuses a product of a supplier the
 * restaurant does not follow, and `updateQuantity` refuses to raise such a line (lowering or
 * removing it stays allowed). Surfaces use `FollowAndAddButton`, which follows first.
 */
export function useCartActions() {
  const dispatch = useAppDispatch()
  const store = useStore<CartStateShape>()
  const ownerEmail = useAppSelector((state) => state.auth.user?.email ?? null)

  const addItem = useCallback(
    (item: CartItem): CartChangeResult => {
      if (blockedByFollow(item.product)) {
        return { ok: false, reason: 'FOLLOW_REQUIRED', supplierId: item.product.supplier_id }
      }
      dispatch(addItemAction({ item, ownerEmail }))
      return { ok: true }
    },
    [dispatch, ownerEmail]
  )

  const removeItem = useCallback(
    (productId: string) => dispatch(removeItemAction({ productId, ownerEmail })),
    [dispatch, ownerEmail]
  )

  const updateQuantity = useCallback(
    (productId: string, quantity: number): CartChangeResult => {
      const line = store.getState().cart.items.find((i) => i.productId === productId)
      if (line && quantity > line.quantity && blockedByFollow(line.product)) {
        return { ok: false, reason: 'FOLLOW_REQUIRED', supplierId: line.product.supplier_id }
      }
      dispatch(updateQuantityAction({ productId, quantity, ownerEmail }))
      return { ok: true }
    },
    [dispatch, ownerEmail, store]
  )

  const markSupplierFollowed = useCallback(
    (supplierId: string) =>
      dispatch(setSupplierFollowState({ supplierId, isFollowed: true, ownerEmail })),
    [dispatch, ownerEmail]
  )

  const markSupplierUnfollowed = useCallback(
    (supplierId: string) =>
      dispatch(setSupplierFollowState({ supplierId, isFollowed: false, ownerEmail })),
    [dispatch, ownerEmail]
  )

  const clearCart = useCallback(
    () => dispatch(clearCartAction({ ownerEmail })),
    [dispatch, ownerEmail]
  )

  const saveDraft = useCallback(
    (name: string) => dispatch(saveDraftAction({ name, ownerEmail })),
    [dispatch, ownerEmail]
  )

  const loadDraft = useCallback(
    (draftId: string) => dispatch(loadDraftAction({ draftId, ownerEmail })),
    [dispatch, ownerEmail]
  )

  const deleteDraft = useCallback(
    (draftId: string) => dispatch(deleteDraftAction({ draftId, ownerEmail })),
    [dispatch, ownerEmail]
  )

  const rehydrateCart = useCallback(
    () => dispatch(rehydrateCartAction({ email: ownerEmail })),
    [dispatch, ownerEmail]
  )

  return {
    addItem,
    removeItem,
    updateQuantity,
    markSupplierFollowed,
    markSupplierUnfollowed,
    clearCart,
    saveDraft,
    loadDraft,
    deleteDraft,
    rehydrateCart,
  }
}
