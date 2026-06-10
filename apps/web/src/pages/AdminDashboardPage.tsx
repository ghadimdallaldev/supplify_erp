import { lazy, useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { useGetAdminPreferencesQuery } from '../services/api'
import { AdminPortalNav } from '../components/admin/AdminPortalNav'
import { AdminPageHeader } from '../components/admin/AdminPageHeader'
import { getAdminPageHeader } from '../lib/adminPageHeaders'
import { AdminTenantDiagnosticsDrawer } from '../components/admin/AdminTenantDiagnosticsDrawer'
import {
  AdminResetPasswordDialog,
  type AdminResetPasswordTarget,
} from '../components/admin/AdminResetPasswordDialog'
import { usePermissions } from '../hooks/usePermissions'
import { useAppSelector } from '../hooks/redux'
import type { AdminTenantType } from '../lib/adminTenantSearch'
import {
  AdminTabScrollRow,
  type AdminCanTabMap,
  type AdminTabKey,
  useAdminChangePlanDialog,
} from '../components/admin/dashboard'
import { AdminTabMount } from '../components/admin/dashboard/AdminTabMount'
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
  const { can } = usePermissions()
  const { user } = useAppSelector((state) => state.auth)

  const canAdminTab: AdminCanTabMap = {
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
  }

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

  const [selectedTab, setSelectedTab] = useState(preferredTab)
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
    setSelectedTab(preferredTab)
  }, [preferredTab])

  useEffect(() => {
    const allowed = canAdminTab[selectedTab as AdminTabKey]
    if (allowed === false) {
      const fallback =
        (
          ['overview', 'finance', 'tenants', 'users', 'plans', 'subscriptions', 'activity'] as const
        ).find((tab) => canAdminTab[tab]) ?? 'overview'
      setSelectedTab(fallback)
    }
  }, [selectedTab, user?.adminPermissions, canAdminTab])

  return (
    <div
      className="admin-page-shell flex min-h-0 flex-1 flex-col"
      data-testid="admin-dashboard-page"
    >
      <AdminPortalNav />
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <AdminPageHeader
          {...getAdminPageHeader(
            initialTab === 'suppliers'
              ? 'suppliers'
              : initialTab === 'restaurants'
                ? 'restaurants'
                : 'platform'
          )}
        />

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <AdminTabScrollRow className="mb-1">
            <TabsList className="min-w-max justify-start">
              {initialTab !== 'suppliers' && initialTab !== 'restaurants' && (
                <>
                  {canAdminTab.overview && <TabsTrigger value="overview">Overview</TabsTrigger>}
                  {canAdminTab.activity && <TabsTrigger value="activity">Activity</TabsTrigger>}
                  {canAdminTab.tenants && <TabsTrigger value="tenants">Tenants</TabsTrigger>}
                  {canAdminTab.users && <TabsTrigger value="users">Users</TabsTrigger>}
                  {canAdminTab.subscriptions && (
                    <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
                  )}
                  {canAdminTab.plans && <TabsTrigger value="plans">Plans</TabsTrigger>}
                  {canAdminTab.finance && <TabsTrigger value="finance">Finance</TabsTrigger>}
                  {canAdminTab.usage && <TabsTrigger value="usage">Usage</TabsTrigger>}
                  {canAdminTab.features && <TabsTrigger value="features">Features</TabsTrigger>}
                  {canAdminTab.deals && <TabsTrigger value="deals">Deals & Boosts</TabsTrigger>}
                  {canAdminTab.limits && <TabsTrigger value="limits">Limits</TabsTrigger>}
                  {canAdminTab.operations && (
                    <TabsTrigger value="operations">Operations</TabsTrigger>
                  )}
                  {canAdminTab.health && <TabsTrigger value="health">Health</TabsTrigger>}
                  {canAdminTab.audit && <TabsTrigger value="audit">Audit</TabsTrigger>}
                </>
              )}

              {(initialTab === 'suppliers' || initialTab === 'restaurants') && (
                <>
                  <TabsTrigger value="tenants">Directory</TabsTrigger>
                  <TabsTrigger value="usage">Usage & Quotas</TabsTrigger>
                  <TabsTrigger value="audit">Audit Logs</TabsTrigger>
                </>
              )}
            </TabsList>
          </AdminTabScrollRow>

          <TabsContent value="overview" className="w-full space-y-5">
            <AdminTabMount tab="overview" selectedTab={selectedTab}>
              <LazyAdminOverviewTab
                active
                canAdminTab={canAdminTab}
                onNavigateTab={setSelectedTab}
                onOperationsSubTab={setOperationsSubTab}
              />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="plans" className="space-y-5">
            <AdminTabMount tab="plans" selectedTab={selectedTab}>
              <LazyAdminPlansTab active />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-6">
            <AdminTabMount tab="subscriptions" selectedTab={selectedTab}>
              <LazyAdminSubscriptionsTab active onOpenChangePlan={openChangePlan} />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="operations" className="space-y-5">
            <AdminTabMount tab="operations" selectedTab={selectedTab}>
              <AdminOperationsPanel
                initialSubTab={operationsSubTab}
                onNavigateDeals={() => setSelectedTab('deals')}
              />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="health" className="space-y-5">
            <AdminTabMount tab="health" selectedTab={selectedTab}>
              <LazyAdminHealthTab active />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="finance" className="space-y-5">
            <AdminTabMount tab="finance" selectedTab={selectedTab}>
              <LazyAdminFinanceTab active />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <AdminTabMount tab="users" selectedTab={selectedTab}>
              <AdminUsersTab />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="tenants" className="space-y-4">
            <AdminTabMount tab="tenants" selectedTab={selectedTab}>
              <LazyAdminTenantsTab
                active
                initialTab={initialTab}
                onOpenChangePlan={openChangePlan}
                onPasswordReset={setPasswordResetTarget}
                onTenantDiag={setTenantDiag}
                onNavigateTab={setSelectedTab}
              />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <AdminTabMount tab="usage" selectedTab={selectedTab}>
              <LazyAdminUsageTab
                active
                initialTab={initialTab}
                onOpenChangePlan={openChangePlan}
                onTenantDiag={setTenantDiag}
              />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="features">
            <AdminTabMount tab="features" selectedTab={selectedTab}>
              <LazyAdminFeaturesTab active />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="deals">
            <AdminTabMount tab="deals" selectedTab={selectedTab}>
              <AdminDealsPanel />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="limits">
            <AdminTabMount tab="limits" selectedTab={selectedTab}>
              <AdminLimitsTab />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="activity">
            <AdminTabMount tab="activity" selectedTab={selectedTab}>
              <LazyAdminActivityTab active />
            </AdminTabMount>
          </TabsContent>

          <TabsContent value="audit">
            <AdminTabMount tab="audit" selectedTab={selectedTab}>
              <LazyAdminAuditTab active />
            </AdminTabMount>
          </TabsContent>
        </Tabs>

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
      </div>
    </div>
  )
}
