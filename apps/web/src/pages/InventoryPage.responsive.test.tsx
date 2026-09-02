import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { InventoryPage } from './InventoryPage'
import { renderWithProviders } from '../test/utils'
import { expectLgCardTableSplit } from '../test/viewports'

const mockInventory = vi.fn()
const mockWarehouses = vi.fn()

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
    isViewOnly: () => false,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    useGetInventoryListQuery: (...args: unknown[]) => mockInventory(...args),
    useGetWarehousesQuery: (...args: unknown[]) => mockWarehouses(...args),
    useCreateInventoryAdjustmentMutation: () => [vi.fn(), { isLoading: false }],
  }
})

describe('InventoryPage responsive layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWarehouses.mockReturnValue({ data: { warehouses: [] }, isLoading: false })
    mockInventory.mockReturnValue({
      data: {
        inventory: [
          {
            id: 'inv-1',
            product_id: 'p1',
            product_name: 'Tomatoes',
            sku: 'TOM-1',
            available_qty: 12,
            reserved_qty: 0,
            isLowStock: false,
            low_stock_threshold: 10,
          },
        ],
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
  })

  it('uses lg card/table split for supplier inventory', () => {
    renderWithProviders(<InventoryPage />)

    const cards = screen.getByTestId('inventory-card-list')
    const table = screen.getByTestId('inventory-table-view')
    expectLgCardTableSplit(cards, table)
    expect(within(cards).getByText('Tomatoes')).toBeInTheDocument()
  })
})
