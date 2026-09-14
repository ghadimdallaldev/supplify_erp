import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import { InventoryPage } from './InventoryPage'
import { renderWithProviders } from '../test/utils'

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

function itemScope(productName: string) {
  // Card list is always in the DOM (lg:hidden); table is lg:block — both present in jsdom.
  const cards = screen.getByTestId('inventory-card-list')
  const card = within(cards).getByText(productName).closest('div.space-y-3')
  if (!card) throw new Error(`Card not found for ${productName}`)
  return within(card as HTMLElement)
}

describe('InventoryPage supplier stock status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWarehouses.mockReturnValue({ data: { warehouses: [] }, isLoading: false })
  })

  it('shows Out of stock for zero available qty', () => {
    mockInventory.mockReturnValue({
      data: {
        inventory: [
          {
            id: 'p1',
            product_id: 'p1',
            product_name: 'Empty Product',
            sku: 'EMP-1',
            available_qty: 0,
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

    renderWithProviders(<InventoryPage />)
    expect(itemScope('Empty Product').getByText('Out of stock')).toBeInTheDocument()
  })

  it('shows Low stock when API marks isLowStock', () => {
    mockInventory.mockReturnValue({
      data: {
        inventory: [
          {
            id: 'p2',
            product_id: 'p2',
            product_name: 'Low Product',
            sku: 'LOW-1',
            available_qty: 5,
            reserved_qty: 0,
            isLowStock: true,
            low_stock_threshold: 10,
          },
        ],
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders(<InventoryPage />)
    expect(itemScope('Low Product').getByText('Low stock')).toBeInTheDocument()
  })

  it('shows In stock for healthy inventory', () => {
    mockInventory.mockReturnValue({
      data: {
        inventory: [
          {
            id: 'p3',
            product_id: 'p3',
            product_name: 'Healthy Product',
            sku: 'OK-1',
            available_qty: 50,
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

    renderWithProviders(<InventoryPage />)
    expect(itemScope('Healthy Product').getByText('In stock')).toBeInTheDocument()
  })
})
