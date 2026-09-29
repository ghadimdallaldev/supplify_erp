import type { PublicSupplierProduct } from './admin'

export type PublicCustomerType = 'RESTAURANT' | 'CONSUMER' | 'GUEST'
export type PublicFulfillmentMethod = 'DELIVERY' | 'PICKUP'
export type PublicPaymentMethod = 'CASH_ON_DELIVERY' | 'CASH_ON_PICKUP' | 'BANK_TRANSFER'

export type PublicDeliveryAddress = {
  line1: string
  line2?: string
  city: string
  region?: string
  postalCode?: string
  country: string
  lat?: number
  lng?: number
}

export type PublicOrderItemInput = { productId: string; quantity: number }

export type PublicOrderPreview = {
  supplierId: string
  supplierName: string
  items: Array<{
    productId: string
    name: string
    sku?: string | null
    unit?: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  subtotal: number
  deliveryFee: number
  total: number
  currency: string
  fulfillmentMethod: PublicFulfillmentMethod
  deliveryAddress?: PublicDeliveryAddress | null
  pickupLocation?: { id: string; name: string; address?: Record<string, unknown> | null } | null
  paymentMethod: PublicPaymentMethod
  bankTransferInstructions?: string | null
}

export type PublicOrder = {
  id: string
  reference: string
  customerType: PublicCustomerType
  status: string
  subtotal: number
  deliveryFee: number
  total: number
  currency: string
  fulfillmentMethod: PublicFulfillmentMethod
  deliveryLocation?: Record<string, unknown> | null
  paymentMethod: PublicPaymentMethod
  customer?: { name: string; phone: string; email?: string | null } | null
  notes?: string | null
  placedAt?: string | null
  createdAt: string
  supplierName?: string
  items: PublicOrderPreview['items']
}

export type SupplierPublicSalesConfig = {
  supplierId: string
  enabled: boolean
  publicCatalogEnabled: boolean
  storefrontUrl: string
  paymentMethods: PublicPaymentMethod[]
  bankTransferInstructions?: string | null
  deliveryEnabled: boolean
  deliveryWarehouseIds: string[]
  pickupEnabled: boolean
  pickupWarehouse?: { id: string; name: string; address?: Record<string, unknown> | null } | null
  validationErrors: string[]
}

export type ConsumerAddress = {
  id: string
  label?: string | null
  recipient_name: string
  phone: string
  address_json: PublicDeliveryAddress
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
    product: PublicSupplierProduct | null
  }>
}
