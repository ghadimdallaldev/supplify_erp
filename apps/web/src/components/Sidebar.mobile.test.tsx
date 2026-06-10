import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'

vi.mock('../hooks/redux', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      auth: {
        user: {
          role: 'RESTAURANT',
          displayName: 'Host User',
          tenantPermissions: ['RESERVATIONS_VIEW', 'ORDERS_VIEW'],
        },
      },
    }),
}))

vi.mock('../hooks/useImpersonation', () => ({
  useImpersonation: () => ({
    isImpersonating: false,
    isEffectiveSupplier: false,
    isEffectiveRestaurant: true,
    isPlatformAdmin: false,
    shouldLoadTenantEntitlements: true,
  }),
}))

vi.mock('../hooks/useNotificationBadge', () => ({
  useNotificationBadge: () => ({ unreadCount: 0 }),
}))

vi.mock('./BranchSwitcher', () => ({
  BranchSwitcher: () => null,
}))

vi.mock('../services/api', () => ({
  useGetEntitlementsQuery: () => ({
    data: { entitlements: { plan: { code: 'gold' }, features: {} } },
  }),
  useGetDashboardStatsQuery: () => ({ data: {} }),
  useGetDisputesQuery: () => ({ data: { disputes: [] } }),
  useGetIncomingDisputesQuery: () => ({ data: { disputes: [] } }),
}))

vi.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
  }),
}))

describe('Sidebar mobile', () => {
  it('renders off-canvas by default and opens when mobileOpen is true', () => {
    const { rerender } = render(
      <MemoryRouter>
        <Sidebar mobileOpen={false} />
      </MemoryRouter>
    )

    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.className).toContain('-translate-x-full')

    rerender(
      <MemoryRouter>
        <Sidebar mobileOpen onMobileClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByTestId('sidebar').className).toContain('translate-x-0')
  })
})
