import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { store } from '../../store'
import { setUser } from '../../features/auth/authSlice'
import { DealTargetingPickers, type DealTargetingValue } from './DealTargetingPickers'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useGetSupplierMeQuery: () => ({ data: { supplier: { id: 'sup-1' } } }),
    useGetProductsQuery: () => ({ data: { products: [] }, isLoading: false }),
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
        ],
      },
      isLoading: false,
    }),
    useGetProductCategoriesQuery: () => ({
      data: {
        departments: [
          {
            id: 'dept-dairy',
            slug: 'dept-dairy-eggs-cheese',
            name: 'Dairy, eggs & cheese',
            name_ar: null,
            icon_key: 'cheese',
            product_count: 4,
            categories: [
              {
                id: 'leaf-cheese',
                slug: 'cheese',
                name: 'Cheese',
                name_ar: null,
                icon_key: 'cheese',
                product_count: 4,
              },
              {
                id: 'leaf-milk',
                slug: 'milk',
                name: 'Milk',
                name_ar: null,
                icon_key: 'drop',
                product_count: 0,
              },
            ],
          },
        ],
      },
      isLoading: false,
    }),
  }
})

const START: DealTargetingValue = {
  appliesTo: 'all',
  productIds: [],
  categoryIds: [],
  shelfIds: [],
  restaurantTypes: [],
  areas: [],
}

function Harness({ onValue }: { onValue: (v: DealTargetingValue) => void }) {
  const [value, setValue] = useState<DealTargetingValue>(START)
  return (
    <DealTargetingPickers
      value={value}
      onChange={(next) => {
        setValue(next)
        onValue(next)
      }}
    />
  )
}

describe('DealTargetingPickers', () => {
  beforeEach(() => {
    store.dispatch(
      setUser({
        id: 'u-sup',
        email: 'supplier@example.com',
        displayName: 'Sam Supplier',
        role: 'SUPPLIER',
        createdAt: '2026-01-01',
      })
    )
  })

  it('deal picker offers shelves', async () => {
    const onValue = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<Harness onValue={onValue} />)

    const appliesTo = screen.getByRole('combobox', { name: /Applies to/ })
    await user.selectOptions(appliesTo, 'specific_shelves')
    await user.click(screen.getByRole('checkbox', { name: /Cheese counter/ }))
    expect(onValue).toHaveBeenLastCalledWith(
      expect.objectContaining({ appliesTo: 'specific_shelves', shelfIds: ['shelf-1'] })
    )

    // Categories are leaves the supplier sells in, grouped by department.
    await user.selectOptions(appliesTo, 'specific_categories')
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ shelfIds: [] }))
    expect(screen.getByRole('checkbox', { name: /Cheese/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Milk/ })).not.toBeInTheDocument()
    expect(screen.getByText('Dairy, eggs & cheese')).toBeInTheDocument()
  })
})
