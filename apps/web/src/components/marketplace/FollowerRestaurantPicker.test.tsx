import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { FollowerRestaurantPicker } from './FollowerRestaurantPicker'

const mockRestaurants = vi.fn()

vi.mock('../../services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/api')>()),
  useGetRestaurantsQuery: (...a: unknown[]) => mockRestaurants(...a),
}))

const lastArgs = () =>
  mockRestaurants.mock.calls[mockRestaurants.mock.calls.length - 1]?.[0] as Record<string, unknown>

describe('FollowerRestaurantPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRestaurants.mockReturnValue({
      data: {
        restaurants: [
          { id: 'r1', name: 'Harbour Grill' },
          { id: 'r2', name: 'Corner Deli' },
        ],
        pagination: { total: 2, limit: 20, offset: 0 },
      },
      isFetching: false,
    })
  })

  it('searches followers on the server instead of filtering a capped list', async () => {
    renderWithProviders(<FollowerRestaurantPicker value="" onChange={vi.fn()} />)

    expect(lastArgs()).toMatchObject({ limit: 20, offset: 0 })
    expect(lastArgs().limit).toBeLessThanOrEqual(20)

    await userEvent.type(screen.getByRole('combobox'), 'harb')
    await waitFor(() => expect(lastArgs()).toMatchObject({ q: 'harb' }))
  })

  it('selecting a result reports the restaurant', async () => {
    const onChange = vi.fn()
    renderWithProviders(<FollowerRestaurantPicker value="" onChange={onChange} />)

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Corner Deli' }))

    expect(onChange).toHaveBeenCalledWith('r2', { id: 'r2', name: 'Corner Deli' })
  })
})
