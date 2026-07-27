import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '../components/Sidebar'
import { MemoryRouter } from 'react-router-dom'

vi.mock('./redux', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      auth: {
        user: {
          role: 'SUPPLIER',
          displayName: 'Driver User',
          tenantPermissions: ['DRIVER_DELIVERIES_VIEW', 'DRIVER_DELIVERIES_MANAGE'],
          workspace: { roleName: 'Driver' },
          tenantRoles: ['Driver'],
        },
      },
    }),
}))

vi.mock('./useImpersonation', () => ({
  useImpersonation: () => ({
    isImpersonating: false,
    isEffectiveSupplier: true,
    isEffectiveRestaurant: false,
    isPlatformAdmin: false,
    shouldLoadTenantEntitlements: true,
  }),
}))

vi.mock('./usePermissions', () => ({
  usePermissions: () => ({
    can: (key: string) => key === 'DRIVER_DELIVERIES_VIEW' || key === 'DRIVER_DELIVERIES_MANAGE',
    canAny: (...keys: string[]) =>
      keys.some((k) => k === 'DRIVER_DELIVERIES_VIEW' || k === 'DRIVER_DELIVERIES_MANAGE'),
    isViewOnly: () => false,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('../components/BranchSwitcher', () => ({
  BranchSwitcher: () => null,
}))

vi.mock('./useNotificationBadge', () => ({
  useNotificationBadge: () => ({ unreadCount: 0 }),
}))

vi.mock('../services/api', () => ({
  useGetEntitlementsQuery: () => ({
    data: { entitlements: { plan: { code: 'gold' }, features: {} } },
  }),
  useGetDashboardSummaryQuery: () => ({ data: { stats: {} } }),
  useGetDisputesQuery: () => ({ data: { disputes: [] } }),
  useGetIncomingDisputesQuery: () => ({ data: { disputes: [] } }),
}))

describe('sidebar RBAC gating', () => {
  it('driver role sees only My Deliveries nav item', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('nav-driver-deliveries')).toBeInTheDocument()
    expect(screen.queryByTestId('nav-products')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-command-center')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-invoices')).not.toBeInTheDocument()
  })
})
