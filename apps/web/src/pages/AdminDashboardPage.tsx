import { lazy, useEffect, useMemo, useState } from 'react'
import { useGetAdminPreferencesQuery } from '../services/api'
import { AdminTenantDiagnosticsDrawer } from '../components/admin/AdminTenantDiagnosticsDrawer'
import {
  AdminResetPasswordDialog,
  type AdminResetPasswordTarget,
} from '../components/admin/AdminResetPasswordDialog'
import { usePermissions } from '../hooks/usePermissions'
import { useAppSelector } from '../hooks/redux'
import { useAdminTab } from '../hooks/useAdminTab'
import { useRegisterAdminShellNav, AdminShellPage } from '../components/admin/shell'
import type { AdminTenantType } from '../lib/adminTenantSearch'
import {
  type AdminCanTabMap,
  type AdminTabKey,
  useAdminChangePlanDialog,
} from '../components/admin/dashboard'
import { AdminTabMount } from '../components/admin/dashboard/AdminTabMount'
import { resolveAdminPortal } from '../components/admin/shell/adminNavConfig'
import { useLocation } from 'react-router-dom'
import {
  LazyAdminActivityTab,
  LazyAdminAuditTab,
  LazyAdminFeaturesTab,
  LazyAdminFinanceTab,
  LazyAdminHealthTab,
  LazyAdminOverviewTab,
  LazyAdminPlansTab,
  LazyAdminSubscriptionsTab,
  LazyAdminTenantsTab,
  LazyAdminUsageTab,
} from '../components/admin/dashboard/lazyAdminDashboardTabs'

const AdminDealsPanel = lazy(() =>
  import('../components/admin/AdminDealsPanel').then((m) => ({ default: m.AdminDealsPanel }))
)
const AdminLimitsTab = lazy(() =>
  import('../components/admin/AdminLimitsTab').then((m) => ({ default: m.AdminLimitsTab }))
)
const AdminUsersTab = lazy(() =>
  import('../components/admin/AdminUsersTab').then((m) => ({ default: m.AdminUsersTab }))
)
const AdminOperationsPanel = lazy(() =>
  import('../components/admin/AdminOperationsPanel').then((m) => ({
    default: m.AdminOperationsPanel,
  }))
)

interface AdminDashboardPageProps {
  initialTab?: string
}

export function AdminDashboardPage({ initialTab = 'overview' }: AdminDashboardPageProps) {
  const { pathname } = useLocation()
  const portal = resolveAdminPortal(pathname)
  const { can } = usePermissions()
  const { user } = useAppSelector((state) => state.auth)

  const adminPermissions = user?.adminPermissions
  const adminPermissionKey = useMemo(
    () =>
      Array.isArray(adminPermissions) && adminPermissions.length > 0
        ? [...adminPermissions].sort().join('|')
        : `fallback:${user?.role ?? 'none'}`,
    [adminPermissions, user?.role]
  )
  const canAdminTab: AdminCanTabMap = useMemo(
    () => ({
      overview: can('ADMIN_ACCESS'),
      activity: can('ADMIN_ACCESS'),
      tenants: can('ADMIN_TENANTS'),
      users: can('ADMIN_SUPPORT'),
      subscriptions: can('ADMIN_PLANS'),
      plans: can('ADMIN_PLANS'),
      finance: can('ADMIN_FINANCE'),
      usage: can('ADMIN_PLANS'),
      features: can('ADMIN_GROWTH'),
      deals: can('ADMIN_GROWTH'),
      limits: can('ADMIN_PLANS'),
      health: can('ADMIN_ACCESS'),
      operations: can('ADMIN_ACCESS'),
      audit: can('ADMIN_ACCESS'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `can` is unstable; permissions drive gating
    [adminPermissionKey]
  )

  const routePinnedTab =
    initialTab === 'suppliers' || initialTab === 'restaurants' ? 'tenants' : null
  const { data: adminPrefsData } = useGetAdminPreferencesQuery(undefined, {
    skip: Boolean(routePinnedTab),
  })
  const preferredTab =
    routePinnedTab ??
    adminPrefsData?.preferences?.defaultLandingTab ??
    user?.adminPreferences?.defaultLandingTab ??
    initialTab ??
    'overview'

  const { selectedTab, setSelectedTab } = useAdminTab(portal, canAdminTab, preferredTab)

  const shellNav = useMemo(
    () => ({ selectedTab, setSelectedTab, canAdminTab }),
    [selectedTab, setSelectedTab, canAdminTab]
  )
  useRegisterAdminShellNav(shellNav)

  const [operationsSubTab, setOperationsSubTab] = useState<
    'summary' | 'email' | 'inventory' | 'fulfillment' | 'gps'
  >('summary')
  const [passwordResetTarget, setPasswordResetTarget] = useState<AdminResetPasswordTarget | null>(
    null
  )
  const [tenantDiag, setTenantDiag] = useState<{
    id: string
    tenantType: AdminTenantType
    name: string
  } | null>(null)

  const { openChangePlan, ChangePlanDialog } = useAdminChangePlanDialog()

  useEffect(() => {
    const allowed = canAdminTab[selectedTab as AdminTabKey]
    if (allowed === false) {
      const fallback =
        (
          ['overview', 'finance', 'tenants', 'users', 'plans', 'subscriptions', 'activity'] as const
        ).find((tab) => canAdminTab[tab]) ?? 'overview'
      setSelectedTab(fallback)
    }
  }, [selectedTab, user?.adminPermissions, canAdminTab, setSelectedTab])

  return (
    <AdminShellPage data-testid="admin-dashboard-page">
      <div className="admin-tab-panel">
        <AdminTabMount tab="overview" selectedTab={selectedTab}>
          <LazyAdminOverviewTab
            active={selectedTab === 'overview'}
            canAdminTab={canAdminTab}
            onNavigateTab={(tab) => setSelectedTab(tab as AdminTabKey)}
            onOperationsSubTab={setOperationsSubTab}
          />
        </AdminTabMount>

        <AdminTabMount tab="plans" selectedTab={selectedTab}>
          <LazyAdminPlansTab active={selectedTab === 'plans'} />
        </AdminTabMount>

        <AdminTabMount tab="subscriptions" selectedTab={selectedTab}>
          <LazyAdminSubscriptionsTab
            active={selectedTab === 'subscriptions'}
            onOpenChangePlan={openChangePlan}
          />
        </AdminTabMount>

        <AdminTabMount tab="operations" selectedTab={selectedTab}>
          {selectedTab === 'operations' && (
            <AdminOperationsPanel
              initialSubTab={operationsSubTab}
              onNavigateDeals={() => setSelectedTab('deals')}
            />
          )}
        </AdminTabMount>

        <AdminTabMount tab="health" selectedTab={selectedTab}>
          <LazyAdminHealthTab active={selectedTab === 'health'} />
        </AdminTabMount>

        <AdminTabMount tab="finance" selectedTab={selectedTab}>
          <LazyAdminFinanceTab active={selectedTab === 'finance'} />
        </AdminTabMount>

        <AdminTabMount tab="users" selectedTab={selectedTab}>
          {selectedTab === 'users' && <AdminUsersTab />}
        </AdminTabMount>

        <AdminTabMount tab="tenants" selectedTab={selectedTab}>
          <LazyAdminTenantsTab
            active={selectedTab === 'tenants'}
            initialTab={initialTab}
            onOpenChangePlan={openChangePlan}
            onPasswordReset={setPasswordResetTarget}
            onTenantDiag={setTenantDiag}
            onNavigateTab={(tab) => setSelectedTab(tab as AdminTabKey)}
          />
        </AdminTabMount>

        <AdminTabMount tab="usage" selectedTab={selectedTab}>
          <LazyAdminUsageTab
            active={selectedTab === 'usage'}
            initialTab={initialTab}
            onOpenChangePlan={openChangePlan}
            onTenantDiag={setTenantDiag}
          />
        </AdminTabMount>

        <AdminTabMount tab="features" selectedTab={selectedTab}>
          <LazyAdminFeaturesTab active={selectedTab === 'features'} />
        </AdminTabMount>

        <AdminTabMount tab="deals" selectedTab={selectedTab}>
          {selectedTab === 'deals' && <AdminDealsPanel />}
        </AdminTabMount>

        <AdminTabMount tab="limits" selectedTab={selectedTab}>
          {selectedTab === 'limits' && <AdminLimitsTab />}
        </AdminTabMount>

        <AdminTabMount tab="activity" selectedTab={selectedTab}>
          <LazyAdminActivityTab active={selectedTab === 'activity'} />
        </AdminTabMount>

        <AdminTabMount tab="audit" selectedTab={selectedTab}>
          <LazyAdminAuditTab active={selectedTab === 'audit'} />
        </AdminTabMount>
      </div>

      {ChangePlanDialog}

      <AdminResetPasswordDialog
        open={Boolean(passwordResetTarget)}
        onOpenChange={(open) => !open && setPasswordResetTarget(null)}
        target={passwordResetTarget}
      />

      {tenantDiag && (
        <AdminTenantDiagnosticsDrawer
          open={Boolean(tenantDiag)}
          onOpenChange={(open) => !open && setTenantDiag(null)}
          tenantId={tenantDiag.id}
          tenantType={tenantDiag.tenantType}
          tenantName={tenantDiag.name}
          onNavigateLimits={() => {
            setTenantDiag(null)
            setSelectedTab('limits')
          }}
          onNavigateFeatures={() => {
            setTenantDiag(null)
            setSelectedTab('features')
          }}
        />
      )}
    </AdminShellPage>
  )
}
