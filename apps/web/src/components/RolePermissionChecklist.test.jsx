import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/utils'
import { RolePermissionChecklist } from './RolePermissionChecklist'

describe('RolePermissionChecklist', () => {
  it('renders restaurant permission domains without supplier-only warehouses', () => {
    renderWithProviders(
      <RolePermissionChecklist
        tenantType="RESTAURANT"
        selected={['ORDERS_VIEW']}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Orders')).toBeInTheDocument()
    expect(screen.queryByText('Warehouses')).not.toBeInTheDocument()
  })

  it('includes warehouses domain for supplier roles', () => {
    renderWithProviders(
      <RolePermissionChecklist tenantType="SUPPLIER" selected={[]} onChange={vi.fn()} />
    )
    expect(screen.getByText('Warehouses')).toBeInTheDocument()
  })
})
