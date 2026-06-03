import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FulfillmentRoutesTab } from './FulfillmentRoutesTab'

vi.mock('../../services/api', () => ({
  useGetFulfillmentRoutesQuery: () => ({
    data: { routes: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGetFulfillmentRouteQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

describe('FulfillmentRoutesTab', () => {
  it('shows empty state pointing to Driver Dispatch', () => {
    render(
      <MemoryRouter>
        <FulfillmentRoutesTab />
      </MemoryRouter>
    )
    expect(screen.getByTestId('routes-empty')).toHaveTextContent(/no routes planned yet/i)
    expect(screen.getByRole('link', { name: /driver dispatch/i })).toBeInTheDocument()
  })
})
