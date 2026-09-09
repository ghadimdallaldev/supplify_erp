import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import {
  useGetAdminActivityQuery,
  useGetAdminDealInsightsQuery,
  useGetAdminHealthQuery,
  useGetAdminPendingDealsQuery,
} from '../../services/api'
import {
  ArrowRight,
  CreditCard,
  Flag,
  HeartPulse,
  Layers,
  ScrollText,
  Sliders,
  Tag,
  Users,
  Wrench,
} from 'lucide-react'
import { AdminRefreshBar } from './adminUi'
import { AttentionPanel, buildAttentionItems } from './AttentionPanel'
import { QuickActionGrid, type QuickAction } from './QuickActionGrid'
import { RecentActivityList } from './RecentActivityList'

export function AdminOverviewExtras({
  overview,
  onNavigateTab,
  onRefresh,
  refreshing,
  lastUpdated,
  canNavigateTab,
  recentApiErrors,
}: {
  overview: Record<string, unknown> | undefined
  onNavigateTab: (tab: string) => void
  onRefresh?: () => void
  refreshing?: boolean
  lastUpdated?: Date | null
  canNavigateTab?: (tab: string) => boolean
  recentApiErrors?: unknown[]
}) {
  const { t } = useTranslation('admin')
  const { data: dealInsights } = useGetAdminDealInsightsQuery()
  const { data: pendingDealsData } = useGetAdminPendingDealsQuery()
  const { data: healthData } = useGetAdminHealthQuery(undefined, {
    skip: Array.isArray(recentApiErrors),
  })
  const {
    data: activityData,
    isLoading: activityLoading,
    isError: activityError,
    error: activityQueryError,
    refetch: refetchActivity,
  } = useGetAdminActivityQuery({
    limit: 8,
    offset: 0,
  })

  const insights = dealInsights?.insights as Record<string, number> | undefined
  const pendingDeals = Array.isArray(pendingDealsData?.deals) ? pendingDealsData.deals : []
  const recentErrors = Array.isArray(recentApiErrors)
    ? recentApiErrors
    : Array.isArray(healthData?.recentApiErrors)
      ? healthData.recentApiErrors
      : []
  const recentEvents = Array.isArray(activityData?.events) ? activityData.events : []

  const attentionItems = buildAttentionItems(overview, {
    pendingApproval: Number(insights?.pending_approval || 0),
    pendingPayment: Number(insights?.pending_payment || 0),
    recentErrorCount: recentErrors.length,
  })

  const allQuickActions: QuickAction[] = [
    { label: t('overview.extras.manageTenants'), tab: 'tenants', icon: Users },
    { label: t('overview.extras.reviewSubscriptions'), tab: 'subscriptions', icon: CreditCard },
    { label: t('overview.extras.planLimits'), tab: 'plans', icon: Layers },
    { label: t('overview.extras.featureOverrides'), tab: 'features', icon: Flag },
    { label: t('overview.extras.limitOverrides'), tab: 'limits', icon: Sliders },
    { label: t('overview.extras.healthCheck'), tab: 'health', icon: HeartPulse },
    { label: t('overview.extras.auditLogs'), tab: 'audit', icon: ScrollText },
    { label: t('overview.extras.reviewDeals'), tab: 'deals', icon: Tag },
    { label: t('overview.extras.operations'), tab: 'operations', icon: Wrench },
  ]

  const quickActions = allQuickActions.map((action) => ({
    ...action,
    disabled: canNavigateTab ? !canNavigateTab(action.tab) : false,
  }))

  return (
    <div className="w-full space-y-4">
      <AdminRefreshBar lastUpdated={lastUpdated} onRefresh={onRefresh} refreshing={refreshing} />

      <div
        className="relative z-0 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="admin-overview-panels"
      >
        <Card className="lg:col-span-1">
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">
              {t('overview.extras.needsAttention')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <AttentionPanel
              items={attentionItems}
              onNavigateTab={onNavigateTab}
              pendingDeals={pendingDeals}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between px-4 pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">
              {t('overview.extras.recentActivity')}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onNavigateTab('activity')}
            >
              {t('overview.extras.viewAll')} <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <RecentActivityList
              events={recentEvents}
              isLoading={activityLoading}
              isError={activityError}
              errorMessage={(activityQueryError as { data?: { message?: string } })?.data?.message}
              onRetry={() => refetchActivity()}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 overflow-visible">
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">
              {t('overview.extras.quickActions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <QuickActionGrid actions={quickActions} onNavigateTab={onNavigateTab} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
