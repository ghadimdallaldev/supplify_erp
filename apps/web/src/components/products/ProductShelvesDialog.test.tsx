import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { ProductShelvesDialog } from './ProductShelvesDialog'

const archiveShelf = vi.fn()
const createShelf = vi.fn()
const changeShelfProducts = vi.fn()
const members = [
  { id: 'm1', name: 'Halloumi', sku: 'H-1' },
  { id: 'm2', name: 'Akkawi', sku: 'A-1' },
]
const others = [{ id: 's1', name: 'Feta', sku: 'F-1' }]

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetShelvesQuery: () => ({
      data: {
        shelves: [
          {
            id: 'shelf-1',
            name: 'Cheese counter',
            name_ar: null,
            display_order: 0,
            product_count: 4,
          },
          {
            id: 'shelf-2',
            name: 'Weekly picks',
            name_ar: null,
            display_order: 1,
            product_count: 2,
          },
        ],
      },
      isLoading: false,
    }),
    useCreateShelfMutation: () => [createShelf, { isLoading: false }],
    useUpdateShelfMutation: () => [vi.fn(), { isLoading: false }],
    useReorderShelvesMutation: () => [vi.fn(), { isLoading: false }],
    useChangeShelfProductsMutation: () => [changeShelfProducts, { isLoading: false }],
    useArchiveShelfMutation: () => [archiveShelf, { isLoading: false }],
    useGetProductsQuery: (args?: { shelfId?: string }) =>
      args?.shelfId
        ? { data: { products: members }, isLoading: false }
        : { data: { products: [...members, ...others] }, isLoading: false, isFetching: false },
  }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

describe('ProductShelvesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shelves dialog archive in-use shows deals', async () => {
    archiveShelf.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: {
            ok: false,
            error: {
              name: 'SHELF_IN_USE',
              code: 'shelfInUse',
              message: 'This shelf is used by live deals or routing rules',
              details: {
                deals: [{ id: 'deal-1', name: 'Summer cheese week' }],
                rules: [{ id: 'rule-1', name: 'Cold store (priority 1)' }],
              },
            },
          },
        }),
    })
    const user = userEvent.setup()
    renderWithProviders(<ProductShelvesDialog open onOpenChange={() => {}} />)

    const row = screen.getByTestId('shelf-row-shelf-1')
    expect(within(row).getByText('Cheese counter')).toBeInTheDocument()
    expect(within(row).getByText(/4 products/)).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: /Archive Cheese counter/ }))
    await user.click(screen.getByRole('button', { name: 'Archive shelf' }))

    expect(archiveShelf).toHaveBeenCalledWith('shelf-1')
    const inUse = await screen.findByRole('alert')
    expect(within(inUse).getByText('Summer cheese week')).toBeInTheDocument()
    expect(within(inUse).getByText('Cold store (priority 1)')).toBeInTheDocument()
  })

  it('saving shelf products sends only what changed', async () => {
    changeShelfProducts.mockReturnValue({ unwrap: () => Promise.resolve({ shelf: {} }) })
    const user = userEvent.setup()
    renderWithProviders(<ProductShelvesDialog open onOpenChange={() => {}} />)

    const row = screen.getByTestId('shelf-row-shelf-1')
    await user.click(within(row).getByRole('button', { name: 'Products' }))
    await user.click(screen.getByRole('checkbox', { name: /Halloumi/ }))
    await user.click(screen.getByRole('checkbox', { name: /Feta/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(changeShelfProducts).toHaveBeenCalledWith({
      id: 'shelf-1',
      add: ['s1'],
      remove: ['m1'],
    })
  })
})
