export type ReportDateParams = {
  from?: string
  to?: string
  granularity?: string
}

export type RestaurantOrderVolumeRow = {
  period: string
  order_count: number
  total_amount: number | string
}

export type RestaurantSpendBySupplierRow = {
  supplier_id: string
  supplier_name: string
  total_spend: number | string
  order_count: number
}

export type RestaurantTopProductRow = {
  product_id: string
  product_name: string
  sku?: string
  total_qty?: number | string
  quantity?: number | string
  total_spend: number | string
}

export type SupplierRevenueTrendRow = {
  period: string
  revenue: number | string
  order_count: number
}

export type SupplierTopRestaurantRow = {
  restaurant_id: string
  restaurant_name: string
  revenue: number | string
  order_count: number
}

export type SupplierOrderVolumeRow = {
  period: string
  order_count: number
}

export type ReportTabKey =
  | 'order-volume'
  | 'spend-by-supplier'
  | 'top-products'
  | 'revenue-trend'
  | 'top-restaurants'
