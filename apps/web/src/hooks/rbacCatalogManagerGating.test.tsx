import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'

vi.mock('./usePermissions', () => ({
  usePermissions: () => ({
    can: (key: string) =>
      ['CATALOG_VIEW', 'CATALOG_EDIT', 'CATALOG_MANAGE', 'ORDERS_VIEW', 'INVENTORY_VIEW'].includes(
        key
      ),
    canAny: (...keys: string[]) =>
      keys.some((k) =>
        ['CATALOG_VIEW', 'CATALOG_EDIT', 'CATALOG_MANAGE', 'ORDERS_VIEW'].includes(k)
      ),
    isViewOnly: () => false,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('./redux', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      auth: {
        user: {
          role: 'SUPPLIER',
          tenantPermissions: ['CATALOG_VIEW', 'CATALOG_EDIT', 'CATALOG_MANAGE', 'ORDERS_VIEW'],
          workspace: { roleName: 'Catalog Manager' },
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

vi.mock('./useNotificationBadge', () => ({
  useNotificationBadge: () => ({ unreadCount: 0 }),
}))

vi.mock('../components/BranchSwitcher', () => ({
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

describe('catalog manager sidebar', () => {
  it('shows products but not invoices or settings', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('nav-products')).toBeInTheDocument()
    expect(screen.queryByTestId('nav-invoices')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-settings')).not.toBeInTheDocument()
  })
})
