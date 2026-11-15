export type QuickListItem = {
  id: string
  product_id: string
  product_currency?: string | null
  product_name?: string
  quantity: number
  unit?: string
}

export type QuickList = {
  id: string
  name: string
  description?: string
  item_count?: number
  items?: QuickListItem[]
  supplier_id?: string
  supplier_name?: string
}
