import { describe, expect, it } from 'vitest'
import {
  labelForPermission,
  SUPPLIER_PERMISSION_DOMAINS,
  RESTAURANT_PERMISSION_DOMAINS,
} from './permissionLabels'

describe('permissionLabels', () => {
  it('labels driver delivery permissions for role editor', () => {
    expect(labelForPermission('DRIVER_DELIVERIES_VIEW')).toBe('View assigned deliveries')
    expect(labelForPermission('DRIVER_DELIVERIES_MANAGE')).toBe('Update delivery status & proof')
  })

  it('supplier domains include driver deliveries group', () => {
    expect(SUPPLIER_PERMISSION_DOMAINS['Driver deliveries']).toEqual([
      'DRIVER_DELIVERIES_VIEW',
      'DRIVER_DELIVERIES_MANAGE',
    ])
  })

  it('restaurant domains omit supplier-only driver deliveries', () => {
    expect(RESTAURANT_PERMISSION_DOMAINS['Driver deliveries']).toBeUndefined()
  })

  it('labels platform admin permissions', () => {
    expect(labelForPermission('ADMIN_FINANCE')).toBe('View financial overview')
    expect(labelForPermission('ADMIN_GROWTH')).toBe('Manage features & growth')
  })
})
