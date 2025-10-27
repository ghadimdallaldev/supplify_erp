import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { CartItem, CartGroup } from '../../types'

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
    addItem: (state, action: PayloadAction<CartItem>) => {
      const existingItem = state.items.find(
        item => item.productId === action.payload.productId
      )
      
      if (existingItem) {
        existingItem.quantity += action.payload.quantity
      } else {
        state.items.push(action.payload)
      }
      
      cartSlice.caseReducers.updateGroups(state)
    },
    removeItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(item => item.productId !== action.payload)
      cartSlice.caseReducers.updateGroups(state)
    },
    updateQuantity: (state, action: PayloadAction<{ productId: string; quantity: number }>) => {
      const item = state.items.find(item => item.productId === action.payload.productId)
      if (item) {
        if (action.payload.quantity <= 0) {
          state.items = state.items.filter(item => item.productId !== action.payload.productId)
        } else {
          item.quantity = action.payload.quantity
        }
        cartSlice.caseReducers.updateGroups(state)
      }
    },
    clearCart: (state) => {
      state.items = []
      state.groups = []
      state.total = 0
    },
    saveDraft: (state, action: PayloadAction<{ name: string }>) => {
      const draft = {
        id: Date.now().toString(),
        name: action.payload.name,
        items: state.items,
        createdAt: new Date().toISOString(),
      }
      state.drafts.push(draft)
    },
    loadDraft: (state, action: PayloadAction<string>) => {
      const draft = state.drafts.find(d => d.id === action.payload)
      if (draft) {
        state.items = draft.items
        cartSlice.caseReducers.updateGroups(state)
      }
    },
    deleteDraft: (state, action: PayloadAction<string>) => {
      state.drafts = state.drafts.filter(d => d.id !== action.payload)
    },
    updateGroups: (state) => {
      // Group items by supplier
      const supplierMap = new Map<string, CartGroup>()
      
      state.items.forEach(item => {
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
        
        // Calculate line total
        const unitPrice = item.product.current_price || 0
        const lineTotal = unitPrice * item.quantity
        group.subtotal += lineTotal
      })
      
      state.groups = Array.from(supplierMap.values())
      state.total = state.groups.reduce((sum, group) => sum + group.subtotal, 0)
    },
  },
})

export const { addItem, removeItem, updateQuantity, clearCart, saveDraft, loadDraft, deleteDraft } = cartSlice.actions
export default cartSlice.reducer
