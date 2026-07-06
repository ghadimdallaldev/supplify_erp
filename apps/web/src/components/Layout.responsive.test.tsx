import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { ROUTER_FUTURE } from '../lib/routerFuture'

vi.mock('./Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar-mock" />,
}))

vi.mock('./Header', () => ({
  Header: () => <header data-testid="header-mock" />,
}))

vi.mock('./ImpersonationBanner', () => ({ ImpersonationBanner: () => null }))
vi.mock('./OfflineBanner', () => ({ OfflineBanner: () => null }))
vi.mock('./UpgradeModal', () => ({ UpgradeModal: () => null }))
vi.mock('./billing/PaymentModal', () => ({ PaymentModal: () => null }))
vi.mock('./RestaurantMobileNav', () => ({ RestaurantMobileNav: () => null }))
vi.mock('./SupplierMobileNav', () => ({ SupplierMobileNav: () => null }))
vi.mock('./LayoutTenantAlerts', () => ({
  LayoutTenantAlerts: () => null,
  isBillingAlertVisible: () => false,
}))
vi.mock('./TenantBrandingProvider', () => ({
  TenantBrandingProvider: ({ children }: { children: unknown }) => children,
}))
vi.mock('../contexts/BranchContext', () => ({
  BranchProvider: ({ children }: { children: unknown }) => children,
}))
vi.mock('../hooks/useNotificationAlerts', () => ({
  useNotificationAlerts: () => {},
}))
vi.mock('../hooks/useCartActions', () => ({
  useCartActions: () => ({ rehydrateCart: vi.fn() }),
}))
vi.mock('../hooks/useImpersonation', () => ({
  useImpersonation: () => ({
    isImpersonating: false,
    isPlatformAdmin: false,
    shouldLoadTenantEntitlements: false,
    isEffectiveRestaurant: true,
  }),
}))
vi.mock('../hooks/redux', () => ({
  useAppSelector: (fn: (s: unknown) => unknown) =>
    fn({
      auth: { user: { role: 'RESTAURANT', email: 'test@example.com', id: 'u1' } },
      monetization: {
        blockedCountLast7d: 0,
        recentBlockedSummary: { limitKeys: [], featureKeys: [] },
      },
    }),
  useAppDispatch: () => vi.fn(),
}))
vi.mock('../services/api', () => ({
  useGetEntitlementsQuery: () => ({ data: undefined }),
  useGetBillingStatusQuery: () => ({ data: undefined }),
  useRecordConversionEventMutation: () => [vi.fn()],
  api: { util: { invalidateTags: vi.fn() } },
}))
vi.mock('../features/monetization/monetizationSlice', () => ({
  refreshBlockedCount: () => ({ type: 'mock/refreshBlockedCount' }),
}))
vi.mock('../lib/appSocket', () => ({
  getAppSocket: () => ({ on: vi.fn(), off: vi.fn() }),
  releaseAppSocket: vi.fn(),
}))

describe('Layout shell responsive', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps overflow-x-hidden on main content to prevent page-level horizontal scroll', () => {
    render(
      <MemoryRouter initialEntries={['/app/dashboard']} future={ROUTER_FUTURE}>
        <Routes>
          <Route path="/app" element={<Layout />}>
            <Route path="dashboard" element={<div data-testid="page-content">Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )

    const main = screen.getByRole('main')
    expect(main.className).toContain('overflow-x-hidden')
    expect(main.className).toContain('min-w-0')
  })
})
