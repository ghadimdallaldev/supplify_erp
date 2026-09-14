import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { RequirePermission } from '../components/RequirePermission'

vi.mock('./usePermissions', () => ({
  usePermissions: () => ({
    can: (key: string) => key === 'INVOICES_VIEW',
    canAny: (...keys: string[]) => keys.includes('INVOICES_VIEW'),
    isViewOnly: () => true,
    isWorkspaceViewer: false,
  }),
}))

vi.mock('./redux', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      auth: {
        user: {
          role: 'SUPPLIER',
          displayName: 'Finance User',
          tenantPermissions: ['INVOICES_VIEW', 'INVOICES_MANAGE'],
          workspace: { roleName: 'Accountant' },
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
    data: { entitlements: { plan: { code: 'gold' }, features: { finance_invoices: true } } },
  }),
  useGetDashboardSummaryQuery: () => ({ data: { stats: {} } }),
  useGetDisputesQuery: () => ({ data: { disputes: [] } }),
  useGetIncomingDisputesQuery: () => ({ data: { disputes: [] } }),
}))

describe('finance role sidebar gating', () => {
  it('shows invoices but not catalog or promotions nav', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('nav-invoices')).toBeInTheDocument()
    expect(screen.queryByTestId('nav-products')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-promotions')).not.toBeInTheDocument()
  })
})

describe('RequirePermission page guard', () => {
  it('blocks direct route content when permission missing', () => {
    render(
      <RequirePermission permission="CATALOG_VIEW" title="products">
        <div data-testid="protected">secret</div>
      </RequirePermission>
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Access restricted/i)
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })
})
