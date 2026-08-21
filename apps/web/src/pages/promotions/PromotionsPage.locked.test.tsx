import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PromotionsPage } from './PromotionsPage'

vi.mock('../../hooks/useWorkspaceRole', () => ({
  useWorkspaceRole: () => ({
    roleName: 'Owner',
    isDriverRole: false,
    isReadOnlyViewer: false,
    persona: {
      id: 'supplier_owner',
      promotionsCopy: {
        title: 'Deals',
        subtitle: 'Create supplier deals within your plan limits.',
        listTitle: 'Your deals',
        newButton: 'Create deal',
        performanceTitle: 'Deals performance (30 days)',
      },
    },
  }),
}))

vi.mock('../../services/api', () => ({
  useGetEntitlementsQuery: () => ({
    data: {
      entitlements: {
        plan: { code: 'free', name: 'Free Trial' },
        features: { promotions: false },
        limits: {},
        usage: {},
      },
    },
  }),
  useGetPromotionsQuery: () => ({
    data: undefined,
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
  }),
  useCreatePromotionMutation: () => [vi.fn(), { isLoading: false }],
  usePayActivationMutation: () => [vi.fn(), { isLoading: false }],
  usePausePromotionMutation: () => [vi.fn(), { isLoading: false }],
  useResumePromotionMutation: () => [vi.fn(), { isLoading: false }],
  useDeletePromotionMutation: () => [vi.fn(), { isLoading: false }],
}))

describe('PromotionsPage locked state', () => {
  it('renders the standard FeatureLockedCard with upgrade CTA when deals are not on the plan', () => {
    render(
      <MemoryRouter>
        <PromotionsPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/not available on your current plan/i)).toBeInTheDocument()
    expect(screen.getByText(/Free Trial/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view plans/i })).toBeInTheDocument()
  })
})
