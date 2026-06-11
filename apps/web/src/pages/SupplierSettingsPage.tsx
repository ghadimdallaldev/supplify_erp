import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/card'
import { DetailPageSkeleton } from '../components/ui/detail-page-skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Package, ShoppingCart, Clock, DollarSign } from 'lucide-react'
import { RequirePermission } from '../components/RequirePermission'
import { LazyTabMount } from '../components/LazyTabMount'
import { usePermissions } from '../hooks/usePermissions'
import { useAppSelector } from '../hooks/redux'
import { formatCurrency } from '../utils/format'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import {
  useGetSupplierMeQuery,
  useGetProductsQuery,
  useGetOrdersQuery,
  useGetDashboardStatsQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import {
  CONTACTS_TAB_ENABLED,
  DELIVERY_ZONES_ENABLED,
  SUPPLIER_SETTINGS_URL_TABS,
  SupplierSettingsTabLoading,
} from '../components/supplier/settings/supplierSettingsShared'
import { SupplierPushNotificationBanner } from '../components/supplier/settings/SupplierPushNotificationBanner'
import {
  LazySupplierProfileTab,
  LazySupplierBusinessTab,
  LazySupplierWarehousesTab,
  LazySupplierPlanTab,
  LazySupplierBranchesTab,
  LazySupplierTeamTab,
  LazySupplierNotificationsTab,
  LazySupplierDriversTab,
  LazySupplierActivityTab,
} from '../components/supplier/settings/lazySupplierSettingsTabs'

export function SupplierSettingsPage() {
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('profile')
  const canViewSettings = can('SETTINGS_VIEW')

  const { data: supplierData, isLoading: isLoadingSupplier } = useGetSupplierMeQuery(undefined, {
    skip: !canViewSettings,
  })
  const { data: stats } = useGetDashboardStatsQuery()
  const { data: productsData } = useGetProductsQuery(
    { limit: 1000 },
    { skip: !supplierData?.supplier?.id }
  )
  const { data: ordersData } = useGetOrdersQuery(
    { limit: 100 },
    { skip: !supplierData?.supplier?.id }
  )
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const tenantAuditEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'tenant_audit_log'
  )

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (!tab) return
    if (tab === 'contacts' || tab === 'delivery') {
      setActiveTab('profile')
      return
    }
    if ((SUPPLIER_SETTINGS_URL_TABS as readonly string[]).includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const statistics = useMemo(() => {
    const products = productsData?.products || []
    const orders = ordersData?.orders || []

    return {
      totalProducts: products.length,
      activeProducts: products.filter((p: any) => p.status === 'ACTIVE').length,
      totalOrders: stats?.totalOrders || orders.length,
      pendingOrders:
        stats?.pendingOrders ||
        orders.filter((o: any) => o.status === 'PENDING' || o.status === 'PLACED').length,
      completedOrders:
        stats?.completedOrders ||
        orders.filter((o: any) => o.status === 'COMPLETED' || o.status === 'DELIVERED').length,
      totalRevenue:
        stats?.totalRevenue ||
        orders
          .filter((o: any) => o.status === 'COMPLETED' || o.status === 'DELIVERED')
          .reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0),
    }
  }, [productsData, ordersData, stats])

  if (isLoadingSupplier) {
    return <DetailPageSkeleton rows={6} />
  }

  return (
    <RequirePermission permission="SETTINGS_VIEW" title="supplier settings">
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Supplier Settings</h1>
          <p className="text-[var(--text-muted)] mt-2">Manage your business profile and settings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-[var(--brand-ultra)] to-[var(--brand-pale)] border-[var(--app-border)]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--brand-mid)]">Total Products</p>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {statistics.totalProducts}
                  </p>
                  <p className="text-xs text-[var(--brand-mid)] mt-1">
                    {statistics.activeProducts} active
                  </p>
                </div>
                <Package className="h-10 w-10 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[var(--mint-pale)] to-[var(--mint-pale)] border-[var(--mint)]/35">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--mint)]">Total Orders</p>
                  <p className="text-2xl font-bold text-[var(--mint)]">{statistics.totalOrders}</p>
                  <p className="text-xs text-[var(--mint)] mt-1">
                    {statistics.completedOrders} completed
                  </p>
                </div>
                <ShoppingCart className="h-10 w-10 text-[var(--mint)]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[var(--amber-pale)] to-[var(--amber-pale)] border-[var(--amber-mid)]/35">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--amber)]">Pending Orders</p>
                  <p className="text-2xl font-bold text-[var(--amber)]">
                    {statistics.pendingOrders}
                  </p>
                  <p className="text-xs text-[var(--amber)] mt-1">Awaiting fulfillment</p>
                </div>
                <Clock className="h-10 w-10 text-[var(--amber-mid)]" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[var(--brand-pale)] to-[var(--brand-ultra)] border-[var(--app-border)]">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--brand-mid)]">Total Revenue</p>
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {formatCurrency(statistics.totalRevenue)}
                  </p>
                  <p className="text-xs text-[var(--brand-mid)] mt-1">All-time</p>
                </div>
                <DollarSign className="h-10 w-10 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="justify-start">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            {CONTACTS_TAB_ENABLED && <TabsTrigger value="contacts">Contacts</TabsTrigger>}
            {(can('STAFF_VIEW') || can('SETTINGS_VIEW')) && (
              <TabsTrigger value="team">Team & roles</TabsTrigger>
            )}
            <TabsTrigger value="business">Business</TabsTrigger>
            {can('WAREHOUSES_VIEW') && <TabsTrigger value="warehouses">Warehouses</TabsTrigger>}
            {DELIVERY_ZONES_ENABLED && <TabsTrigger value="delivery">Delivery Zones</TabsTrigger>}
            <TabsTrigger value="drivers">Drivers</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="plan">Plan & usage</TabsTrigger>
            {can('SETTINGS_VIEW') && tenantAuditEnabled && (
              <TabsTrigger value="activity">Activity</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <LazyTabMount
              tab="profile"
              selectedTab={activeTab}
              className="space-y-4"
              fallback={<SupplierSettingsTabLoading />}
            >
              <LazySupplierProfileTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="business" className="space-y-4">
            <LazyTabMount
              tab="business"
              selectedTab={activeTab}
              className="space-y-4"
              fallback={<SupplierSettingsTabLoading />}
            >
              <LazySupplierBusinessTab />
            </LazyTabMount>
          </TabsContent>

          {can('WAREHOUSES_VIEW') && (
            <TabsContent value="warehouses" className="space-y-4">
              <LazyTabMount
                tab="warehouses"
                selectedTab={activeTab}
                className="space-y-4"
                fallback={<SupplierSettingsTabLoading />}
              >
                <LazySupplierWarehousesTab />
              </LazyTabMount>
            </TabsContent>
          )}

          <TabsContent value="plan" className="space-y-4">
            <LazyTabMount
              tab="plan"
              selectedTab={activeTab}
              className="space-y-4"
              fallback={<SupplierSettingsTabLoading />}
            >
              <LazySupplierPlanTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="branches" className="space-y-4">
            <LazyTabMount
              tab="branches"
              selectedTab={activeTab}
              className="space-y-4"
              fallback={<SupplierSettingsTabLoading />}
            >
              <LazySupplierBranchesTab />
            </LazyTabMount>
          </TabsContent>

          {(can('STAFF_VIEW') || can('SETTINGS_VIEW')) && (
            <TabsContent value="team" className="space-y-4">
              <LazyTabMount
                tab="team"
                selectedTab={activeTab}
                className="space-y-4"
                fallback={<SupplierSettingsTabLoading />}
              >
                <LazySupplierTeamTab />
              </LazyTabMount>
            </TabsContent>
          )}

          <TabsContent value="notifications" className="space-y-4">
            <LazyTabMount
              tab="notifications"
              selectedTab={activeTab}
              className="space-y-4"
              fallback={<SupplierSettingsTabLoading />}
            >
              <LazySupplierNotificationsTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="drivers" className="space-y-4">
            <LazyTabMount
              tab="drivers"
              selectedTab={activeTab}
              className="space-y-4"
              fallback={<SupplierSettingsTabLoading />}
            >
              <LazySupplierDriversTab />
            </LazyTabMount>
          </TabsContent>

          {can('SETTINGS_VIEW') && tenantAuditEnabled && (
            <TabsContent value="activity" className="space-y-4">
              <LazyTabMount
                tab="activity"
                selectedTab={activeTab}
                className="space-y-4"
                fallback={<SupplierSettingsTabLoading />}
              >
                <LazySupplierActivityTab />
              </LazyTabMount>
            </TabsContent>
          )}
        </Tabs>

        <SupplierPushNotificationBanner />
      </div>
    </RequirePermission>
  )
}
