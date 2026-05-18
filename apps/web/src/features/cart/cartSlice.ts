import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { CartItem, CartGroup } from '../../types'
import { loadCartFromStorage, saveCartToStorage } from './cartPersistence'

interface CartState {
  items: CartItem[]
  groups: CartGroup[]
  total: number
  drafts: Array<{
    id: string
    name: string
    items: CartItem[]
    createdAt: string
  }>
}

function recomputeGroups(state: CartState) {
  const supplierMap = new Map<string, CartGroup>()

  state.items.forEach((item) => {
    const supplierId = item.product.supplier_id
    const supplierName = item.product.supplier_name || 'Unknown Supplier'

    if (!supplierMap.has(supplierId)) {
      supplierMap.set(supplierId, {
        supplierId,
        supplierName,
        items: [],
        subtotal: 0,
      })
    }

    const group = supplierMap.get(supplierId)!
    group.items.push(item)
    const unitPrice = item.product.current_price || 0
    group.subtotal += unitPrice * item.quantity
  })

  state.groups = Array.from(supplierMap.values())
  state.total = state.groups.reduce((sum, group) => sum + group.subtotal, 0)
}

function persist(state: CartState, ownerEmail?: string | null) {
  saveCartToStorage(ownerEmail, { items: state.items, drafts: state.drafts })
}

const initialState: CartState = {
  items: [],
  groups: [],
  total: 0,
  drafts: [],
}

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    /** Restore cart from localStorage after login or hard refresh (scoped per user email). */
    rehydrateCart: (state, action: PayloadAction<{ email?: string | null }>) => {
      const saved = loadCartFromStorage(action.payload.email)
      if (!saved) return
      state.items = saved.items
      state.drafts = saved.drafts
      recomputeGroups(state)
    },
    addItem: (state, action: PayloadAction<{ item: CartItem; ownerEmail?: string | null }>) => {
      const { item, ownerEmail } = action.payload
      const existingItem = state.items.find((i) => i.productId === item.productId)

      if (existingItem) {
        existingItem.quantity += item.quantity
      } else {
        state.items.push(item)
      }

      recomputeGroups(state)
      persist(state, ownerEmail)
    },
    removeItem: (
      state,
      action: PayloadAction<{ productId: string; ownerEmail?: string | null }>
    ) => {
      state.items = state.items.filter((item) => item.productId !== action.payload.productId)
      recomputeGroups(state)
      persist(state, action.payload.ownerEmail)
    },
    updateQuantity: (
      state,
      action: PayloadAction<{ productId: string; quantity: number; ownerEmail?: string | null }>
    ) => {
      const { productId, quantity, ownerEmail } = action.payload
      const item = state.items.find((i) => i.productId === productId)
      if (item) {
        if (quantity <= 0) {
          state.items = state.items.filter((i) => i.productId !== productId)
        } else {
          item.quantity = quantity
        }
        recomputeGroups(state)
        persist(state, ownerEmail)
      }
    },
    clearCart: (state, action: PayloadAction<{ ownerEmail?: string | null } | undefined>) => {
      state.items = []
      state.groups = []
      state.total = 0
      persist(state, action?.payload?.ownerEmail)
    },
    saveDraft: (state, action: PayloadAction<{ name: string; ownerEmail?: string | null }>) => {
      const draft = {
        id: Date.now().toString(),
        name: action.payload.name,
        items: [...state.items],
        createdAt: new Date().toISOString(),
      }
      state.drafts.push(draft)
      persist(state, action.payload.ownerEmail)
    },
    loadDraft: (state, action: PayloadAction<{ draftId: string; ownerEmail?: string | null }>) => {
      const draft = state.drafts.find((d) => d.id === action.payload.draftId)
      if (draft) {
        state.items = [...draft.items]
        recomputeGroups(state)
        persist(state, action.payload.ownerEmail)
      }
    },
    deleteDraft: (
      state,
      action: PayloadAction<{ draftId: string; ownerEmail?: string | null }>
    ) => {
      state.drafts = state.drafts.filter((d) => d.id !== action.payload.draftId)
      persist(state, action.payload.ownerEmail)
    },
  },
})

export const {
  addItem,
  removeItem,
  updateQuantity,
  clearCart,
  saveDraft,
  loadDraft,
  deleteDraft,
  rehydrateCart,
} = cartSlice.actions
export default cartSlice.reducer
