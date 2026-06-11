// Cart types
import type { Product } from './products'

export interface CartItem {
  productId: string
  product: Product
  quantity: number
  notes?: string
  quotedUnitPrice?: number
}

export interface CartGroup {
  supplierId: string
  supplierName: string
  items: CartItem[]
  subtotal: number
}
