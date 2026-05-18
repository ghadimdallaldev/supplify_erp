import { useCallback } from 'react'
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
} from '../features/cart/cartSlice'
import type { CartItem } from '../types'

/** Cart mutations with localStorage persistence keyed by signed-in user. */
export function useCartActions() {
  const dispatch = useAppDispatch()
  const ownerEmail = useAppSelector((state) => state.auth.user?.email ?? null)

  const addItem = useCallback(
    (item: CartItem) => dispatch(addItemAction({ item, ownerEmail })),
    [dispatch, ownerEmail]
  )

  const removeItem = useCallback(
    (productId: string) => dispatch(removeItemAction({ productId, ownerEmail })),
    [dispatch, ownerEmail]
  )

  const updateQuantity = useCallback(
    (productId: string, quantity: number) =>
      dispatch(updateQuantityAction({ productId, quantity, ownerEmail })),
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
    clearCart,
    saveDraft,
    loadDraft,
    deleteDraft,
    rehydrateCart,
  }
}
