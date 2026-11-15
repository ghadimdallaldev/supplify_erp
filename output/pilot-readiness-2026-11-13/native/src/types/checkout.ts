/** Existing POST /api/orders payload; the retry key is transported in a header. */
export type CheckoutPayload = {
  items: { productId: string; quantity: number; notes?: string }[]
  quoteLocks?: {
    productId: string
    quoteRequestSupplierId: string
    quoteResponseItemId: string
  }[]
  deliveryDate?: string
  branchId?: string
  deliveryMethod?: string
  deliveryTime?: string
  notes?: string
  status?: string
}

export type CheckoutAttempt = {
  key: string
  payload: CheckoutPayload
  status: 'submitting' | 'uncertain'
}
