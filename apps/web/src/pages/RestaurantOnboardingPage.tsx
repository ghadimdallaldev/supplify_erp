import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { DetailPageSkeleton } from '../components/ui/detail-page-skeleton'
import { SettingsHubLayout } from '../components/settings/SettingsHubLayout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Activity, Bell, Building2, CreditCard, MapPin, Star, Users } from 'lucide-react'
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
  RestaurantSettingsSummary,
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
import { ensureNamespace } from '../i18n'

export function RestaurantOnboardingPage() {
  const { t } = useTranslation('onboarding')
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
    void ensureNamespace('onboarding')
  }, [])

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

  const restaurantName = restaurantData?.restaurant?.name

  return (
    <SettingsHubLayout
      title={t('restaurantSettings.title')}
      description={
        restaurantName
          ? t('restaurantSettings.descriptionWithName', { name: restaurantName })
          : t('restaurantSettings.descriptionDefault')
      }
      stats={
        <RestaurantSettingsSummary
          totalOrders={statistics.totalOrders}
          completedOrders={statistics.completedOrders}
          pendingOrders={statistics.pendingOrders}
          totalSpent={formatCurrency(statistics.totalSpent)}
        />
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="tabs-scroll h-auto w-full justify-start gap-1 rounded-lg p-1 sm:w-auto">
          <TabsTrigger value="profile" className="gap-1.5 text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('restaurantSettings.tabs.profile')}
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('restaurantSettings.tabs.team')}
          </TabsTrigger>
          <TabsTrigger value="branches" className="gap-1.5 text-xs sm:text-sm">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('restaurantSettings.tabs.branches')}
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-1.5 text-xs sm:text-sm">
            <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{t('restaurantSettings.tabs.subscription')}</span>
            <span className="sm:hidden">{t('restaurantSettings.tabs.plan')}</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs sm:text-sm">
            <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">{t('restaurantSettings.tabs.notifications')}</span>
            <span className="sm:hidden">{t('restaurantSettings.tabs.alerts')}</span>
          </TabsTrigger>
          {isOwner && tenantAuditEnabled ? (
            <TabsTrigger value="activity" className="gap-1.5 text-xs sm:text-sm">
              <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('restaurantSettings.tabs.activity')}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="reviews" className="gap-1.5 text-xs sm:text-sm">
            <Star className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('restaurantSettings.tabs.reviews')}
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

        {isOwner && tenantAuditEnabled ? (
          <TabsContent value="activity" className="space-y-4">
            <LazyTabMount
              tab="activity"
              selectedTab={activeTab}
              fallback={<OnboardingTabLoading />}
            >
              <LazyOnboardingActivityTab />
            </LazyTabMount>
          </TabsContent>
        ) : null}

        <TabsContent value="reviews" className="space-y-4">
          <LazyTabMount tab="reviews" selectedTab={activeTab} fallback={<OnboardingTabLoading />}>
            <LazyOnboardingReviewsTab />
          </LazyTabMount>
        </TabsContent>
      </Tabs>
    </SettingsHubLayout>
  )
}
