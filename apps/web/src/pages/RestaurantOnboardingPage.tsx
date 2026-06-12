import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DetailPageSkeleton } from '../components/ui/detail-page-skeleton'
import { KpiCard } from '../components/ui/kpi-card'
import { SettingsHubLayout } from '../components/settings/SettingsHubLayout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  Building2,
  Users,
  CreditCard,
  Settings,
  FileText,
  ShoppingCart,
  Package,
  DollarSign,
  Clock,
  Star,
} from 'lucide-react'
import { formatCurrency } from '../utils/format'
import {
  useGetRestaurantMeQuery,
  useGetOrdersQuery,
  useGetDashboardStatsQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { usePermissions } from '../hooks/usePermissions'
import { isTenantOwner } from '../lib/tenantRoles'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import { LazyTabMount } from '../components/LazyTabMount'
import {
  OnboardingTabLoading,
  RESTAURANT_ONBOARDING_TABS,
} from '../components/restaurant/onboarding/onboardingShared'
import {
  LazyOnboardingActivityTab,
  LazyOnboardingBranchesTab,
  LazyOnboardingNotificationsTab,
  LazyOnboardingProfileTab,
  LazyOnboardingReviewsTab,
  LazyOnboardingSubscriptionTab,
  LazyOnboardingTeamTab,
} from '../components/restaurant/onboarding/lazyRestaurantOnboardingTabs'
import { useAppSelector } from '../hooks/redux'

export function RestaurantOnboardingPage() {
  const { user } = useAppSelector((state) => state.auth)
  const [searchParams] = useSearchParams()
  const { data: restaurantData, isLoading: isLoadingRestaurant } = useGetRestaurantMeQuery()
  const { data: stats } = useGetDashboardStatsQuery()
  const { data: ordersData } = useGetOrdersQuery(
    { limit: 100 },
    { skip: !restaurantData?.restaurant?.id }
  )

  const [activeTab, setActiveTab] = useState('profile')
  const { can } = usePermissions()
  const isOwner = isTenantOwner(user) || can('SETTINGS_MANAGE')
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const tenantAuditEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'tenant_audit_log'
  )

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (
      tab &&
      RESTAURANT_ONBOARDING_TABS.includes(tab as (typeof RESTAURANT_ONBOARDING_TABS)[number])
    ) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const statistics = useMemo(() => {
    const orders = ordersData?.orders || []

    return {
      totalOrders: stats?.totalOrders || orders.length,
      pendingOrders:
        stats?.pendingOrders ||
        orders.filter((o: any) => o.status === 'PENDING' || o.status === 'PLACED').length,
      completedOrders:
        stats?.completedOrders ||
        orders.filter((o: any) => o.status === 'COMPLETED' || o.status === 'DELIVERED').length,
      totalSpent:
        stats?.totalSpent ||
        orders
          .filter((o: any) => o.status === 'COMPLETED' || o.status === 'DELIVERED')
          .reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0),
    }
  }, [ordersData, stats])

  if (isLoadingRestaurant) {
    return <DetailPageSkeleton rows={6} />
  }

  return (
    <SettingsHubLayout
      title="Account Setup"
      description="Complete your business profile and preferences"
      stats={
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Orders"
            value={statistics.totalOrders}
            description="All orders"
            icon={ShoppingCart}
            tone="brand"
          />
          <KpiCard
            label="Completed Orders"
            value={statistics.completedOrders}
            description="Received"
            icon={Package}
            tone="success"
          />
          <KpiCard
            label="Pending Orders"
            value={statistics.pendingOrders}
            description="In progress"
            icon={Clock}
            tone="warning"
          />
          <KpiCard
            label="Total Spent"
            value={formatCurrency(statistics.totalSpent)}
            description="All-time"
            icon={DollarSign}
            tone="brand"
          />
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="justify-start">
          <TabsTrigger value="profile">
            <Building2 className="mr-0 h-4 w-4 sm:mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="mr-0 h-4 w-4 sm:mr-2" />
            Team
          </TabsTrigger>
          <TabsTrigger value="branches">
            <FileText className="mr-0 h-4 w-4 sm:mr-2" />
            Branches
          </TabsTrigger>
          <TabsTrigger value="subscription">
            <CreditCard className="mr-0 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Subscription</span>
            <span className="sm:hidden">Plan</span>
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Settings className="mr-0 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Notifications</span>
            <span className="sm:hidden">Alerts</span>
          </TabsTrigger>
          {isOwner && tenantAuditEnabled && (
            <TabsTrigger value="activity">
              <FileText className="mr-0 h-4 w-4 sm:mr-2" />
              Activity
            </TabsTrigger>
          )}
          <TabsTrigger value="reviews">
            <Star className="mr-0 h-4 w-4 sm:mr-2" />
            Reviews
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <LazyTabMount tab="profile" selectedTab={activeTab} fallback={<OnboardingTabLoading />}>
            <LazyOnboardingProfileTab />
          </LazyTabMount>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <LazyTabMount tab="team" selectedTab={activeTab} fallback={<OnboardingTabLoading />}>
            <LazyOnboardingTeamTab />
          </LazyTabMount>
        </TabsContent>

        <TabsContent value="branches" className="space-y-4">
          <LazyTabMount tab="branches" selectedTab={activeTab} fallback={<OnboardingTabLoading />}>
            <LazyOnboardingBranchesTab />
          </LazyTabMount>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-4">
          <LazyTabMount
            tab="subscription"
            selectedTab={activeTab}
            fallback={<OnboardingTabLoading />}
          >
            <LazyOnboardingSubscriptionTab />
          </LazyTabMount>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <LazyTabMount
            tab="notifications"
            selectedTab={activeTab}
            fallback={<OnboardingTabLoading />}
          >
            <LazyOnboardingNotificationsTab />
          </LazyTabMount>
        </TabsContent>

        {isOwner && tenantAuditEnabled && (
          <TabsContent value="activity" className="space-y-4">
            <LazyTabMount
              tab="activity"
              selectedTab={activeTab}
              fallback={<OnboardingTabLoading />}
            >
              <LazyOnboardingActivityTab />
            </LazyTabMount>
          </TabsContent>
        )}

        <TabsContent value="reviews" className="space-y-4">
          <LazyTabMount tab="reviews" selectedTab={activeTab} fallback={<OnboardingTabLoading />}>
            <LazyOnboardingReviewsTab />
          </LazyTabMount>
        </TabsContent>
      </Tabs>
    </SettingsHubLayout>
  )
}
