import { useLocation } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import { useNotificationBadge } from '../hooks/useNotificationBadge'
import {
  useGetDashboardStatsQuery,
  useGetEntitlementsQuery,
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
} from '../services/api'
import { useImpersonation } from '../hooks/useImpersonation'
import { SupplifyLogo } from './SupplifyLogo'
import { BranchSwitcher } from './BranchSwitcher'
import { getOrderUsageBadge, isEntitlementFeatureEnabled } from '../lib/planLimits'
import { countActiveDisputes } from '../lib/disputeHelpers'
import {
  canUseGlobalReports,
  canUseSupplierDeals,
  canUseFinanceInvoices,
  canUseFulfillment,
  canUseQuickLists,
} from '../lib/planFeatureGates'
import { formatPlanDisplayName } from '../lib/planComparison'
import { buildSidebarSections } from './sidebar/sidebarNavConfig'
import { SidebarNavSection } from './sidebar/SidebarNavSection'

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean
  onMobileClose?: () => void
} = {}) {
  const location = useLocation()
  const { user } = useAppSelector((state) => state.auth)
  const { can, canAny } = usePermissions()
  const { isDriverRole, persona } = useWorkspaceRole()
  const {
    isImpersonating,
    isEffectiveRestaurant,
    isEffectiveSupplier,
    isPlatformAdmin,
    shouldLoadTenantEntitlements,
  } = useImpersonation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })
  const { data: statsData } = useGetDashboardStatsQuery(undefined, {
    skip: (isPlatformAdmin && !isImpersonating) || isDriverRole,
  })
  const { unreadCount: notificationUnreadCount } = useNotificationBadge()

  const hasAdminNavAccess = isPlatformAdmin && !isImpersonating
  const isSupplier = isEffectiveSupplier
  const isRestaurant = isEffectiveRestaurant
  const impersonatingRestaurant = isImpersonating && isEffectiveRestaurant
  const impersonatingSupplier = isImpersonating && isEffectiveSupplier

  const pendingOrders = Number(statsData?.pendingOrders) || 0
  const unreadCount = notificationUnreadCount
  const planLabel = entitlementsData?.entitlements?.plan?.name ?? ''
  const planCode = (entitlementsData?.entitlements?.plan?.code ?? 'free').toLowerCase()
  const reportsEnabled = canUseGlobalReports(entitlementsData?.entitlements)
  const supplierDealsEnabled = canUseSupplierDeals(entitlementsData?.entitlements)
  const financeInvoicesEnabled = canUseFinanceInvoices(entitlementsData?.entitlements)
  const fulfillmentEnabled = canUseFulfillment(entitlementsData?.entitlements)
  const quickListsEnabled = canUseQuickLists(entitlementsData?.entitlements)
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )
  const { data: restaurantDisputesData } = useGetDisputesQuery(undefined, {
    skip: !disputesEnabled || isSupplier || !user,
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
  })
  const { data: supplierDisputesData } = useGetIncomingDisputesQuery(undefined, {
    skip: !disputesEnabled || !isSupplier || !user || isDriverRole || !can('FULFILLMENT_VIEW'),
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
  })
  const activeDisputeCount = countActiveDisputes(
    (isSupplier ? supplierDisputesData?.disputes : restaurantDisputesData?.disputes) ?? []
  )
  const promotionsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'promotions'
  )
  const orderUsageBadge = getOrderUsageBadge(entitlementsData?.entitlements)

  const sections = buildSidebarSections({
    can,
    canAny,
    persona,
    isRestaurant,
    isSupplier,
    impersonatingRestaurant,
    impersonatingSupplier,
    hasAdminNavAccess,
    isImpersonating,
    isDriverRole,
    reportsEnabled,
    supplierDealsEnabled,
    financeInvoicesEnabled,
    fulfillmentEnabled,
    quickListsEnabled,
    disputesEnabled,
    promotionsEnabled,
  })

  const initials = (user?.displayName || user?.email || 'U')
    .split(/[\s@]/)
    .filter(Boolean)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const badgeContext = {
    pendingOrders,
    unreadCount,
    activeDisputeCount,
    orderUsageBadge,
    showOrderUsageOnCart: isRestaurant || impersonatingRestaurant,
  }

  return (
    <aside
      data-testid="sidebar"
      aria-label="Main navigation"
      className={[
        'flex flex-col border-r border-[var(--app-border)] bg-[var(--surface)] font-sans',
        'h-screen overflow-y-auto',
        'fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,14rem)] transition-transform duration-200 lg:sticky lg:w-56 lg:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div
        style={{ padding: '14px 14px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}
      >
        <SupplifyLogo size={34} variant="lockup" theme="light" tagline={true} />
      </div>

      <nav
        style={{ flex: 1, padding: '6px 10px', display: 'flex', flexDirection: 'column' }}
        aria-label="Application sections"
      >
        {sections.map((section) => (
          <SidebarNavSection
            key={section.label}
            section={section}
            pathname={location.pathname}
            badges={badgeContext}
            onNavigate={onMobileClose}
          />
        ))}
      </nav>

      <div className="border-t border-[var(--app-border)] p-3 lg:hidden [&>div]:max-w-none [&>div]:w-full [&_select]:max-w-none">
        <BranchSwitcher />
      </div>

      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--app-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--brand), var(--mint-mid))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user?.displayName || user?.email}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
            {user?.role?.toLowerCase()}
          </div>
        </div>
        {planLabel && (
          <span
            style={{
              background: planCode === 'free' ? 'var(--amber-pale)' : 'var(--brand-pale)',
              color: planCode === 'free' ? 'var(--amber)' : 'var(--brand-mid)',
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 4,
              padding: '2px 6px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            {formatPlanDisplayName(planCode, planLabel)}
          </span>
        )}
      </div>
    </aside>
  )
}
