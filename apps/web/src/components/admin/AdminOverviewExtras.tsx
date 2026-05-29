import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import {
  useGetAdminActivityQuery,
  useGetAdminDealInsightsQuery,
  useGetAdminHealthQuery,
  useGetAdminPendingDealsQuery,
} from '../../services/api'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Tag,
  HeartPulse,
  Shield,
  Users,
} from 'lucide-react'
import { AdminEmptyState, AdminLoadingState, AdminRefreshBar, formatAdminDateTime } from './adminUi'

type AttentionItem = {
  id: string
  label: string
  detail?: string
  severity: 'danger' | 'warning' | 'info'
  tab: string
}

export function AdminOverviewExtras({
  overview,
  onNavigateTab,
  onRefresh,
  refreshing,
  lastUpdated,
}: {
  overview: Record<string, unknown> | undefined
  onNavigateTab: (tab: string) => void
  onRefresh?: () => void
  refreshing?: boolean
  lastUpdated?: Date | null
}) {
  const alerts = (overview?.alerts || {}) as Record<string, number>
  const { data: dealInsights } = useGetAdminDealInsightsQuery()
  const { data: pendingDealsData } = useGetAdminPendingDealsQuery()
  const { data: healthData } = useGetAdminHealthQuery()
  const { data: activityData, isLoading: activityLoading } = useGetAdminActivityQuery({
    limit: 8,
    offset: 0,
  })

  const insights = dealInsights?.insights as Record<string, number> | undefined
  const pendingDeals = Array.isArray(pendingDealsData?.deals) ? pendingDealsData.deals : []
  const recentErrors = Array.isArray(healthData?.recentApiErrors) ? healthData.recentApiErrors : []
  const recentEvents = Array.isArray(activityData?.events) ? activityData.events : []

  const attentionItems: AttentionItem[] = []

  const pendingApproval = Number(insights?.pending_approval || 0)
  if (pendingApproval > 0) {
    attentionItems.push({
      id: 'deals-pending',
      label: `${pendingApproval} deal${pendingApproval > 1 ? 's' : ''} pending approval`,
      detail: 'Supplier deals waiting for your review',
      severity: 'warning',
      tab: 'deals',
    })
  }

  const pendingPayment = Number(insights?.pending_payment || 0)
  if (pendingPayment > 0) {
    attentionItems.push({
      id: 'deals-payment',
      label: `${pendingPayment} deal${pendingPayment > 1 ? 's' : ''} pending payment`,
      detail: 'Approved deals awaiting activation payment',
      severity: 'info',
      tab: 'deals',
    })
  }

  const pastDue = Number(alerts.pastDueSubscriptions || 0)
  if (pastDue > 0) {
    attentionItems.push({
      id: 'past-due',
      label: `${pastDue} past-due subscription${pastDue > 1 ? 's' : ''}`,
      detail: 'Billing may need follow-up',
      severity: 'danger',
      tab: 'subscriptions',
    })
  }

  const trialsExpiring = Number(alerts.trialsExpiringSoon || 0)
  if (trialsExpiring > 0) {
    attentionItems.push({
      id: 'trials',
      label: `${trialsExpiring} trial${trialsExpiring > 1 ? 's' : ''} expiring in 7 days`,
      severity: 'warning',
      tab: 'subscriptions',
    })
  }

  const healthIssues = Number(alerts.healthErrors || recentErrors.length || 0)
  if (healthIssues > 0) {
    attentionItems.push({
      id: 'health',
      label: `${healthIssues} recent system error${healthIssues > 1 ? 's' : ''}`,
      detail: 'Check health tab for details',
      severity: 'danger',
      tab: 'health',
    })
  }

  const overdueInvoices = Number(alerts.overdueInvoices || 0)
  if (overdueInvoices > 0) {
    attentionItems.push({
      id: 'overdue-invoices',
      label: `${overdueInvoices} overdue invoice${overdueInvoices > 1 ? 's' : ''}`,
      severity: 'warning',
      tab: 'finance',
    })
  }

  const severityStyles = {
    danger: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  }

  const quickActions = [
    { label: 'Review deals', tab: 'deals', icon: Tag },
    { label: 'Manage tenants', tab: 'tenants', icon: Users },
    { label: 'Subscriptions', tab: 'subscriptions', icon: CreditCard },
    { label: 'Limit overrides', tab: 'limits', icon: Shield },
    { label: 'Health check', tab: 'health', icon: HeartPulse },
    { label: 'Audit logs', tab: 'audit', icon: AlertCircle },
  ]

  return (
    <div className="w-full space-y-5">
      <AdminRefreshBar lastUpdated={lastUpdated} onRefresh={onRefresh} refreshing={refreshing} />

      <div
        className="relative z-0 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="admin-overview-panels"
      >
        {/* Needs attention */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Needs your attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attentionItems.length === 0 ? (
              <AdminEmptyState
                title="All clear"
                description="No pending deal approvals, failed payments, or health issues detected."
                icon={<CheckCircle2 className="h-8 w-8 text-emerald-500" />}
              />
            ) : (
              attentionItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigateTab(item.tab)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition hover:opacity-90 ${severityStyles[item.severity]}`}
                >
                  <p className="text-sm font-semibold">{item.label}</p>
                  {item.detail && <p className="text-xs opacity-80 mt-0.5">{item.detail}</p>}
                </button>
              ))
            )}
            {pendingDeals.length > 0 && (
              <div className="pt-2 border-t border-[var(--app-border)]">
                <p className="text-xs font-medium text-[var(--text-muted)] mb-2">
                  Latest pending deals
                </p>
                <ul className="space-y-1.5">
                  {pendingDeals.slice(0, 3).map((deal) => (
                    <li key={String(deal.id)} className="text-xs">
                      <button
                        type="button"
                        className="text-left hover:underline text-[var(--text)]"
                        onClick={() => onNavigateTab('deals')}
                      >
                        {String(deal.name)} · {String(deal.supplier_name || 'Supplier')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onNavigateTab('activity')}
            >
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <AdminLoadingState label="Loading activity…" />
            ) : recentEvents.length === 0 ? (
              <AdminEmptyState
                title="No recent activity yet"
                description="Platform events will appear here as tenants use the system."
              />
            ) : (
              <ul className="space-y-2.5">
                {recentEvents.map((event) => (
                  <li
                    key={`${event.event_type}-${event.id}`}
                    className="text-xs border-b border-[var(--app-border)]/60 pb-2 last:border-0"
                  >
                    <p className="font-medium text-[var(--text)] truncate">{event.title}</p>
                    {event.subtitle && (
                      <p className="text-[var(--text-muted)] truncate mt-0.5">{event.subtitle}</p>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {formatAdminDateTime(event.occurred_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card className="lg:col-span-1 overflow-visible">
          <CardHeader className="px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
            <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              {quickActions.map(({ label, tab, icon: Icon }) => (
                <Button
                  key={tab}
                  variant="outline"
                  className="box-border h-auto min-h-11 w-full justify-start gap-3 whitespace-normal rounded-lg px-5 py-3.5 text-xs font-medium leading-snug"
                  onClick={() => onNavigateTab(tab)}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 text-left">{label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
