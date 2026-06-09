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
  Shield,
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
}: {
  overview: Record<string, unknown> | undefined
  onNavigateTab: (tab: string) => void
  onRefresh?: () => void
  refreshing?: boolean
  lastUpdated?: Date | null
  canNavigateTab?: (tab: string) => boolean
}) {
  const { data: dealInsights } = useGetAdminDealInsightsQuery()
  const { data: pendingDealsData } = useGetAdminPendingDealsQuery()
  const { data: healthData } = useGetAdminHealthQuery()
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
  const recentErrors = Array.isArray(healthData?.recentApiErrors) ? healthData.recentApiErrors : []
  const recentEvents = Array.isArray(activityData?.events) ? activityData.events : []

  const attentionItems = buildAttentionItems(overview, {
    pendingApproval: Number(insights?.pending_approval || 0),
    pendingPayment: Number(insights?.pending_payment || 0),
    recentErrorCount: recentErrors.length,
  })

  const allQuickActions: QuickAction[] = [
    { label: 'Manage tenants', tab: 'tenants', icon: Users },
    { label: 'Review subscriptions', tab: 'subscriptions', icon: CreditCard },
    { label: 'Plan limits', tab: 'plans', icon: Layers },
    { label: 'Feature overrides', tab: 'features', icon: Flag },
    { label: 'Limit overrides', tab: 'limits', icon: Sliders },
    { label: 'Health check', tab: 'health', icon: HeartPulse },
    { label: 'Audit logs', tab: 'audit', icon: ScrollText },
    { label: 'Review deals', tab: 'deals', icon: Tag },
    { label: 'Operations', tab: 'operations', icon: Wrench },
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
            <CardTitle className="text-sm font-semibold">Needs your attention</CardTitle>
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
            <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onNavigateTab('activity')}
            >
              View all <ArrowRight className="ml-1 h-3 w-3" />
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
            <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <QuickActionGrid actions={quickActions} onNavigateTab={onNavigateTab} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
