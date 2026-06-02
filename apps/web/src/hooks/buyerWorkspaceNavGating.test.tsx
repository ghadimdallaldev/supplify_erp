import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '../components/Sidebar'
import { MemoryRouter } from 'react-router-dom'

vi.mock('./redux', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      auth: {
        user: {
          role: 'RESTAURANT',
          displayName: 'Buyer Chef',
          tenantPermissions: ['ORDERS_VIEW', 'ORDERS_CREATE', 'SUPPLIERS_VIEW'],
          workspace: { roleName: 'Restaurant Buyer' },
          tenantRoles: ['Restaurant Buyer'],
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

vi.mock('../services/api', () => ({
  useGetEntitlementsQuery: () => ({
    data: {
      entitlements: {
        plan: { code: 'buyer_free', name: 'Buyer' },
        isBuyerOnlyWorkspace: true,
        workspaceMode: 'buyer_only',
        features: {},
      },
    },
  }),
  useGetDashboardStatsQuery: () => ({ data: {} }),
  useGetDisputesQuery: () => ({ data: { disputes: [] } }),
  useGetIncomingDisputesQuery: () => ({ data: { disputes: [] } }),
}))

describe('buyer-only workspace nav gating', () => {
  it('hides premium restaurant nav for buyer-only entitlements', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.queryByTestId('nav-staff')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-reservations')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-reports')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-command-center')).not.toBeInTheDocument()
  })
})
