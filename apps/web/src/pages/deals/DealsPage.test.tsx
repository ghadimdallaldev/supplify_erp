import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { DealsPage } from './DealsPage'
const refetch = vi.fn()
let result: any
vi.mock('../../services/api', async (original) => ({
  ...(await original<typeof import('../../services/api')>()),
  useGetActivePromotionsQuery: () => result,
  useGetEntitlementsQuery: () => ({
    data: { entitlements: { features: { supplier_deals: true } } },
  }),
}))
vi.mock('../../hooks/redux', async (original) => ({
  ...(await original<typeof import('../../hooks/redux')>()),
  useAppSelector: () => ({ user: { role: 'RESTAURANT' } }),
}))
vi.mock('../../components/RequirePermission', () => ({
  RequirePermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../../components/deals/DealCard', () => ({
  DealCard: ({ deal }: { deal: any }) => <p>{deal.name}</p>,
}))
beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  result = {
    isLoading: false,
    isError: false,
    refetch,
    data: {
      promotions: [
        { id: 'd1', name: 'Olive oil offer', supplier_id: 's1', supplier_name: 'Cedar' },
        { id: 'd2', name: 'Produce offer', supplier_id: 's2', supplier_name: 'Bekaa' },
      ],
    },
  }
})
describe('deals discovery', () => {
  it('keeps all supplier choices while filtering offers', async () => {
    renderWithProviders(<DealsPage />)
    const select = screen.getByLabelText('Supplier')
    await userEvent.selectOptions(select, 's1')
    expect(screen.getByText('Olive oil offer')).toBeInTheDocument()
    expect(screen.queryByText('Produce offer')).not.toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Bekaa' })).toBeInTheDocument()
    await userEvent.selectOptions(select, 's2')
    expect(screen.getByText('Produce offer')).toBeInTheDocument()
  })
  it('provides a retry when loading fails', async () => {
    result = { ...result, isError: true, data: undefined }
    renderWithProviders(<DealsPage />)
    expect(screen.getByText('Unable to load deals')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
