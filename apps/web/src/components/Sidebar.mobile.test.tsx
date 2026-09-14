import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
  useGetDashboardSummaryQuery: () => ({ data: { stats: {} } }),
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
  afterEach(() => {
    cleanup()
    document.documentElement.dir = 'ltr'
  })

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

  it('keeps desktop sidebar visible in rtl when mobile nav is closed', () => {
    document.documentElement.dir = 'rtl'

    render(
      <MemoryRouter>
        <Sidebar mobileOpen={false} />
      </MemoryRouter>
    )

    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar.className).toContain('lg:translate-x-0')
    expect(sidebar.className).toContain('max-lg:rtl:translate-x-full')
    expect(sidebar.className).not.toMatch(/(?:^|\s)rtl:translate-x-full(?:\s|$)/)
  })
})
