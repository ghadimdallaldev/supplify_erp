import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'

vi.mock('./usePermissions', () => ({
  usePermissions: () => ({
    can: (key: string) =>
      ['RESERVATIONS_VIEW', 'RESERVATIONS_CREATE', 'RESERVATIONS_EDIT'].includes(key),
    canAny: (...keys: string[]) => keys.some((k) => k.startsWith('RESERVATIONS_')),
    isViewOnly: () => false,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('./redux', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      auth: {
        user: {
          role: 'RESTAURANT',
          tenantPermissions: ['RESERVATIONS_VIEW', 'RESERVATIONS_CREATE', 'RESERVATIONS_EDIT'],
          workspace: { roleName: 'FOH Staff' },
        },
      },
    }),
}))

vi.mock('./useImpersonation', () => ({
  useImpersonation: () => ({
    isImpersonating: false,
    isEffectiveSupplier: false,
    isEffectiveRestaurant: true,
    isPlatformAdmin: false,
    shouldLoadTenantEntitlements: true,
  }),
}))

vi.mock('./useNotificationBadge', () => ({
  useNotificationBadge: () => ({ unreadCount: 0 }),
}))

vi.mock('../components/BranchSwitcher', () => ({
  BranchSwitcher: () => null,
}))

vi.mock('../services/api', () => ({
  useGetEntitlementsQuery: () => ({
    data: { entitlements: { plan: { code: 'gold' }, features: { reservations: true } } },
  }),
  useGetDashboardStatsQuery: () => ({ data: {} }),
  useGetDisputesQuery: () => ({ data: { disputes: [] } }),
  useGetIncomingDisputesQuery: () => ({ data: { disputes: [] } }),
}))

describe('restaurant host sidebar', () => {
  it('shows reservations only in operations section', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('nav-reservations')).toBeInTheDocument()
    expect(screen.queryByTestId('nav-staff')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-invoices')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-orders')).not.toBeInTheDocument()
  })
})
