import { useState, useEffect, useMemo, lazy } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DetailPageSkeleton } from '../components/ui/detail-page-skeleton'
import { KpiCard } from '../components/ui/kpi-card'
import { SettingsHubLayout } from '../components/settings/SettingsHubLayout'
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
import { ensureNamespace } from '../i18n'

const LazySupplierDeliveryZonesTab = lazy(() =>
  import('../components/supplier/settings/tabs/SupplierDeliveryZonesTab').then((m) => ({
    default: m.SupplierDeliveryZonesTab,
  }))
)

const LazySupplierContactsTab = lazy(() =>
  import('../components/supplier/settings/tabs/SupplierContactsTab').then((m) => ({
    default: m.SupplierContactsTab,
  }))
)

export function SupplierSettingsPage() {
  const { t } = useTranslation('suppliers')
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
    void ensureNamespace('suppliers')
  }, [])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (!tab) return
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
    <RequirePermission permission="SETTINGS_VIEW" title={t('settings.permissionTitle')}>
      <SettingsHubLayout
        title={t('settings.title')}
        description={t('settings.description')}
        stats={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t('settings.stats.totalProducts')}
              value={statistics.totalProducts}
              description={t('settings.stats.activeProducts', { count: statistics.activeProducts })}
              icon={Package}
              tone="brand"
            />
            <KpiCard
              label={t('settings.stats.totalOrders')}
              value={statistics.totalOrders}
              description={t('settings.stats.completedOrders', {
                count: statistics.completedOrders,
              })}
              icon={ShoppingCart}
              tone="success"
            />
            <KpiCard
              label={t('settings.stats.pendingOrders')}
              value={statistics.pendingOrders}
              description={t('settings.stats.pendingDescription')}
              icon={Clock}
              tone="warning"
            />
            <KpiCard
              label={t('settings.stats.totalRevenue')}
              value={formatCurrency(statistics.totalRevenue)}
              description={t('settings.stats.allTime')}
              icon={DollarSign}
              tone="brand"
            />
          </div>
        }
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="justify-start">
            <TabsTrigger value="profile">{t('settings.tabs.profile')}</TabsTrigger>
            {CONTACTS_TAB_ENABLED && (
              <TabsTrigger value="contacts">{t('settings.tabs.contacts')}</TabsTrigger>
            )}
            {(can('STAFF_VIEW') || can('SETTINGS_VIEW')) && (
              <TabsTrigger value="team">{t('settings.tabs.team')}</TabsTrigger>
            )}
            <TabsTrigger value="business">{t('settings.tabs.business')}</TabsTrigger>
            {can('WAREHOUSES_VIEW') && (
              <TabsTrigger value="warehouses">{t('settings.tabs.warehouses')}</TabsTrigger>
            )}
            {DELIVERY_ZONES_ENABLED && (
              <TabsTrigger value="delivery">{t('settings.tabs.delivery')}</TabsTrigger>
            )}
            <TabsTrigger value="drivers">{t('settings.tabs.drivers')}</TabsTrigger>
            <TabsTrigger value="branches">{t('settings.tabs.branches')}</TabsTrigger>
            <TabsTrigger value="notifications">{t('settings.tabs.notifications')}</TabsTrigger>
            <TabsTrigger value="plan">{t('settings.tabs.plan')}</TabsTrigger>
            {can('SETTINGS_VIEW') && tenantAuditEnabled && (
              <TabsTrigger value="activity">{t('settings.tabs.activity')}</TabsTrigger>
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

          {CONTACTS_TAB_ENABLED && (
            <TabsContent value="contacts" className="space-y-4">
              <LazyTabMount
                tab="contacts"
                selectedTab={activeTab}
                className="space-y-4"
                fallback={<SupplierSettingsTabLoading />}
              >
                <LazySupplierContactsTab />
              </LazyTabMount>
            </TabsContent>
          )}

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

          {DELIVERY_ZONES_ENABLED && (
            <TabsContent value="delivery" className="space-y-4">
              <LazyTabMount
                tab="delivery"
                selectedTab={activeTab}
                className="space-y-4"
                fallback={<SupplierSettingsTabLoading />}
              >
                <LazySupplierDeliveryZonesTab />
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
      </SettingsHubLayout>
    </RequirePermission>
  )
}
