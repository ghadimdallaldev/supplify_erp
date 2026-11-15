export type WarehouseAddress =
  | string
  | {
      line1?: string
      line2?: string
      city?: string
      country?: string
      postalCode?: string
      zip?: string
    }
  | null
  | undefined

export type SupplierWarehouse = {
  id: string
  name: string
  code?: string | null
  address?: WarehouseAddress
  is_active?: boolean
  is_default?: boolean
  is_main?: boolean
}

export type SupplierDriver = {
  id: string
  supplier_id?: string
  warehouse_id?: string | null
  full_name: string
  phone?: string | null
  vehicle_type?: string | null
  vehicle_plate?: string | null
  notes?: string | null
  is_active?: boolean
  warehouse_name?: string | null
  user_id?: string | null
  linked_user_email?: string | null
  linked_user_name?: string | null
}

export function formatWarehouseAddress(address: WarehouseAddress): string | null {
  if (address == null || address === '') return null
  if (typeof address === 'string') {
    const trimmed = address.trim()
    return trimmed || null
  }
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.postalCode ?? address.zip,
    address.country,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

export function warehouseStatusLabel(warehouse: SupplierWarehouse): string {
  if (warehouse.is_active === false) return 'Inactive'
  return 'Active'
}

export function driverStatusLabel(driver: SupplierDriver): string {
  if (driver.is_active === false) return 'Inactive'
  return 'Active'
}

export function driverLinkedUserHint(driver: SupplierDriver): string | null {
  if (driver.linked_user_name?.trim()) return `Linked: ${driver.linked_user_name.trim()}`
  if (driver.linked_user_email?.trim()) return `Linked: ${driver.linked_user_email.trim()}`
  if (driver.user_id) return 'App account linked'
  return 'No app account'
}
