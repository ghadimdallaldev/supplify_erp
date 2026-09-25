import { describe, expect, it } from 'vitest'
import {
  presentRestaurant,
  presentSupplier,
  presentPublicSupplier,
} from './tenant-profile-redaction.js'

const financialRow = {
  id: 'tenant-1',
  name: 'Acme',
  tax_id: 'secret-tax',
  vat_no: 'secret-vat',
  vat_number: 'secret-vat-2',
  trade_license_no: 'secret-license',
}

describe('tenant-profile-redaction', () => {
  it('lets restaurant SETTINGS_VIEW see tax fields', () => {
    const req = {
      userData: { role: 'RESTAURANT' },
      tenantContext: { tenantId: 'tenant-1', permissions: ['SETTINGS_VIEW'], roles: [] },
    }
    expect(presentRestaurant(req, financialRow).tax_id).toBe('secret-tax')
  })

  it('hides restaurant tax from FOH', () => {
    const req = {
      userData: { role: 'RESTAURANT' },
      tenantContext: { tenantId: 'tenant-1', permissions: ['RESERVATIONS_VIEW'], roles: [] },
    }
    expect(presentRestaurant(req, financialRow).tax_id).toBeUndefined()
    expect(presentRestaurant(req, financialRow).name).toBe('Acme')
  })

  it('hides sibling restaurant-org branch tax from Org Viewer', () => {
    const req = {
      userData: { role: 'RESTAURANT' },
      tenantContext: { tenantId: 'tenant-1', permissions: ['SETTINGS_VIEW'], roles: [] },
    }
    const sibling = { ...financialRow, id: 'tenant-2' }
    expect(presentRestaurant(req, sibling, { orgOwner: false }).tax_id).toBeUndefined()
  })

  it('hides restaurant tax from linked suppliers', () => {
    const req = {
      userData: { role: 'SUPPLIER' },
      tenantContext: { tenantId: 'supplier-1', permissions: ['SETTINGS_VIEW'], roles: [] },
    }
    expect(presentRestaurant(req, financialRow).vat_number).toBeUndefined()
  })

  it('hides sibling-branch VAT from Org Viewer', () => {
    const req = {
      userData: { role: 'SUPPLIER' },
      tenantContext: { tenantId: 'supplier-main', permissions: ['SETTINGS_VIEW'], roles: [] },
    }
    const sibling = { ...financialRow, id: 'supplier-2' }
    expect(presentSupplier(req, sibling, { orgOwner: false }).vat_no).toBeUndefined()
  })

  it('lets Org Owner see sibling-branch VAT', () => {
    const req = {
      userData: { role: 'SUPPLIER' },
      tenantContext: { tenantId: 'supplier-main', permissions: [], roles: [] },
    }
    const sibling = { ...financialRow, id: 'supplier-2' }
    expect(presentSupplier(req, sibling, { orgOwner: true }).vat_no).toBe('secret-vat')
  })

  it('always strips VAT from public supplier cards', () => {
    expect(presentPublicSupplier(financialRow).vat_no).toBeUndefined()
    expect(presentPublicSupplier(financialRow).name).toBe('Acme')
  })
})
