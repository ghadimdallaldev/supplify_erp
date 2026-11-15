export type PublicPaymentMethod = 'CASH_ON_DELIVERY' | 'CASH_ON_PICKUP' | 'BANK_TRANSFER'
export type PublicFulfillmentMethod = 'DELIVERY' | 'PICKUP'

export type PublicSupplierSummary = {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
}

export type PublicSupplierProfile = PublicSupplierSummary & {
  publicSalesEnabled?: boolean
  salesLocations?: Array<{
    supplierId: string
    paymentMethods: PublicPaymentMethod[]
    deliveryEnabled: boolean
    pickupEnabled: boolean
  }>
}

export type PublicProduct = {
  id: string
  supplierId?: string | null
  name: string
  sku: string
  category?: string | null
  unit?: string | null
  description?: string | null
  imageUrl?: string | null
  currentPrice?: number | null
  currency?: string
  inStock?: boolean
  orderable?: boolean
  moq?: number
  orderMultiple?: number
}

export type PublicAddress = {
  line1: string
  line2?: string
  city: string
  region?: string
  postalCode?: string
  country: string
  lat?: number
  lng?: number
}

export type PublicOrderPreview = {
  supplierId: string
  supplierName: string
  items: Array<{ productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }>
  subtotal: number
  deliveryFee: number
  total: number
  currency: string
  fulfillmentMethod: PublicFulfillmentMethod
  paymentMethod: PublicPaymentMethod
  bankTransferInstructions?: string | null
}

export type PublicOrder = {
  id: string
  reference: string
  customerType: 'RESTAURANT' | 'CONSUMER' | 'GUEST'
  status: string
  subtotal: number
  deliveryFee: number
  total: number
  currency: string
  fulfillmentMethod: PublicFulfillmentMethod
  paymentMethod: PublicPaymentMethod
  supplierName?: string
  createdAt: string
  items: PublicOrderPreview['items']
}

export type PublicCheckoutPayload = {
  items: Array<{ productId: string; quantity: number }>
  fulfillmentMethod: PublicFulfillmentMethod
  deliveryAddress?: PublicAddress
  paymentMethod: PublicPaymentMethod
}

export type ConsumerAddress = {
  id: string
  label?: string | null
  recipient_name: string
  phone: string
  address_json: PublicAddress
  coords?: { lat: number; lng: number } | null
  is_default: boolean
}

export type ConsumerReorderPreview = {
  orderId: string
  storefrontId: string | null
  supplierLocationId: string | null
  items: Array<{
    productId: string
    name: string
    quantity: number
    available: boolean
    unavailableReason?: string | null
    product: PublicProduct | null
  }>
}
