export type SupplierPriceOffer = {
  productId: string
  productName: string
  supplierId: string
  supplierName: string
  amount: number | string
  currency: string
  minQty: number | string
}

export type SupplierPriceComparison = {
  productName: string
  brand?: string | null
  unit?: string | null
  currency: string
  bestOffer: SupplierPriceOffer
  offers: SupplierPriceOffer[]
  supplierCount: number
  savings: number
  savingsPercent: number
}
