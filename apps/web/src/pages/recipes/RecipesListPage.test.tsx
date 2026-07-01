import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecipesListPage } from './RecipesListPage'

vi.mock('../../components/RequirePermission', () => ({
  RequirePermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (key: string) => key === 'RECIPES_VIEW' || key === 'RECIPES_VIEW_COSTS',
    canAny: () => true,
  }),
}))

vi.mock('../../services/api/endpoints/recipes', () => ({
  useGetRecipesQuery: () => ({
    data: {
      recipes: [
        {
          id: 'r1',
          name: 'Chicken Sandwich',
          category: 'Mains',
          sellingPrice: 12,
          costPerPortion: 4.5,
          foodCostPct: 37.5,
          grossMarginPct: 62.5,
          calcStatus: 'WARNING',
          isActive: true,
          currency: 'USD',
          portionCount: 1,
          restaurantId: 'rest-1',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRecalculateRecipeMutation: () => [vi.fn(), { isLoading: false }],
}))

describe('RecipesListPage', () => {
  it('renders recipe list with cost columns', () => {
    render(
      <MemoryRouter>
        <RecipesListPage />
      </MemoryRouter>
    )
    expect(screen.getByTestId('recipes-list-page')).toBeInTheDocument()
    expect(screen.getByText('Chicken Sandwich')).toBeInTheDocument()
    expect(screen.getByText('Food cost %')).toBeInTheDocument()
  })
})
