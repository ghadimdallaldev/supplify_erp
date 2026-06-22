import { useTranslation } from 'react-i18next'
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
  canUseSupplierGrowth,
} from '../lib/planFeatureGates'
import { canViewSupplierGrowth } from '../lib/tenantRoles'
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
  const { t } = useTranslation('navigation')
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
  const supplierGrowthEnabled =
    canUseSupplierGrowth(entitlementsData?.entitlements) && canViewSupplierGrowth(user, can)
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
    supplierGrowthEnabled,
  })

  const initials = (user?.displayName || user?.email || 'U')
    .split(/[\s@]/)
    .filter(Boolean)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const roleKey = user?.role?.toLowerCase()
  const roleLabel = roleKey ? t(`role.${roleKey}`, { defaultValue: roleKey }) : ''

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
      aria-label={t('sidebar.mainNavAriaLabel')}
      className={[
        'flex flex-col border-e border-[var(--app-border)]/40 bg-[var(--surface)] font-sans',
        'h-screen overflow-y-auto',
        'fixed inset-y-0 start-0 z-50 w-[min(100vw-3rem,14rem)] lg:sticky lg:w-56 lg:translate-x-0',
        'transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : 'max-lg:-translate-x-full max-lg:rtl:translate-x-full',
      ].join(' ')}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="shrink-0 border-b border-[var(--app-border)]/40 px-3.5 py-3.5">
        <SupplifyLogo size={34} variant="lockup" theme="light" tagline={true} />
      </div>

      <nav
        style={{ flex: 1, padding: '6px 10px', display: 'flex', flexDirection: 'column' }}
        aria-label={t('sidebar.sectionsAriaLabel')}
      >
        {sections.map((section) => (
          <SidebarNavSection
            key={section.labelKey ?? section.label ?? section.items[0]?.href}
            section={section}
            pathname={location.pathname}
            badges={badgeContext}
            onNavigate={onMobileClose}
          />
        ))}
      </nav>

      <div className="border-t border-[var(--app-border)]/40 p-3 lg:hidden [&>div]:max-w-none [&>div]:w-full [&_select]:max-w-none">
        <BranchSwitcher />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--app-border)]/40 px-3.5 py-2.5">
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
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{roleLabel}</div>
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
