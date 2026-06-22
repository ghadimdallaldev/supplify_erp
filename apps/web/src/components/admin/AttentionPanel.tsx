import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import { AdminEmptyState } from './adminUi'

export type AttentionSeverity = 'critical' | 'warning' | 'info' | 'healthy'

export type AttentionItem = {
  id: string
  label: string
  detail?: string
  severity: AttentionSeverity
  tab: string
  actionLabel?: string
}

const severityStyles: Record<AttentionSeverity, string> = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

const badgeStyles: Record<AttentionSeverity, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-800',
  info: 'bg-sky-100 text-sky-700',
  healthy: 'bg-emerald-100 text-emerald-700',
}

const badgeLabels: Record<AttentionSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
  healthy: 'Healthy',
}

export function buildAttentionItems(
  overview: Record<string, unknown> | undefined,
  options: {
    pendingApproval?: number
    pendingPayment?: number
    recentErrorCount?: number
  } = {}
): AttentionItem[] {
  const alerts = (overview?.alerts || {}) as Record<string, number>
  const operational = (overview?.operational || {}) as Record<string, number>
  const items: AttentionItem[] = []

  const pendingApproval = Number(options.pendingApproval ?? alerts.pendingDealApprovals ?? 0)
  if (pendingApproval > 0) {
    items.push({
      id: 'deals-pending',
      label: `${pendingApproval} deal${pendingApproval > 1 ? 's' : ''} pending approval`,
      detail: 'Supplier deals waiting for your review',
      severity: 'warning',
      tab: 'deals',
      actionLabel: 'Review deals',
    })
  }

  const pendingPayment = Number(options.pendingPayment ?? alerts.pendingDealPayments ?? 0)
  if (pendingPayment > 0) {
    items.push({
      id: 'deals-payment',
      label: `${pendingPayment} deal${pendingPayment > 1 ? 's' : ''} pending payment`,
      detail: 'Approved deals awaiting activation payment',
      severity: 'info',
      tab: 'deals',
      actionLabel: 'Review deals',
    })
  }

  const pastDue = Number(alerts.pastDueSubscriptions || 0)
  if (pastDue > 0) {
    items.push({
      id: 'past-due',
      label: `${pastDue} past-due subscription${pastDue > 1 ? 's' : ''}`,
      detail: 'Billing may need follow-up',
      severity: 'critical',
      tab: 'subscriptions',
      actionLabel: 'Review subscriptions',
    })
  }

  const trialsExpiring = Number(alerts.trialsExpiringSoon || 0)
  if (trialsExpiring > 0) {
    items.push({
      id: 'trials',
      label: `${trialsExpiring} trial${trialsExpiring > 1 ? 's' : ''} expiring in 7 days`,
      severity: 'warning',
      tab: 'subscriptions',
      actionLabel: 'Review subscriptions',
    })
  }

  const healthIssues = Number(options.recentErrorCount ?? alerts.healthErrors ?? 0)
  if (healthIssues > 0) {
    items.push({
      id: 'health',
      label: `${healthIssues} recent system error${healthIssues > 1 ? 's' : ''}`,
      detail: 'Check health tab for details',
      severity: 'critical',
      tab: 'health',
      actionLabel: 'View health',
    })
  }

  const overdueInvoices = Number(alerts.overdueInvoices || 0)
  if (overdueInvoices > 0) {
    items.push({
      id: 'overdue-invoices',
      label: `${overdueInvoices} overdue invoice${overdueInvoices > 1 ? 's' : ''}`,
      severity: 'warning',
      tab: 'finance',
      actionLabel: 'Open finance',
    })
  }

  const emailFailed = Number(operational.emailFailed24h || 0)
  if (emailFailed >= 1) {
    items.push({
      id: 'email-failures',
      label: `${emailFailed} failed email${emailFailed > 1 ? 's' : ''} in 24h`,
      detail: 'Review delivery logs in Operations',
      severity: emailFailed >= 5 ? 'warning' : 'info',
      tab: 'operations',
      actionLabel: 'Operations',
    })
  }

  const openFulfillment = Number(operational.openFulfillmentIssues || 0)
  if (openFulfillment >= 1) {
    items.push({
      id: 'fulfillment-issues',
      label: `${openFulfillment} open fulfillment issue${openFulfillment > 1 ? 's' : ''}`,
      severity: openFulfillment >= 10 ? 'warning' : 'info',
      tab: 'operations',
      actionLabel: 'Operations',
    })
  }

  const staleGps = Number(operational.staleGpsDeliveries || 0)
  if (staleGps >= 1) {
    items.push({
      id: 'stale-gps',
      label: `${staleGps} deliver${staleGps > 1 ? 'ies' : 'y'} with stale GPS`,
      severity: staleGps >= 10 ? 'warning' : 'info',
      tab: 'operations',
      actionLabel: 'Operations',
    })
  }

  const expiredLots = Number(operational.expiredInventoryLots || 0)
  if (expiredLots >= 1) {
    items.push({
      id: 'expired-lots',
      label: `${expiredLots} expired inventory lot${expiredLots > 1 ? 's' : ''}`,
      severity: expiredLots >= 20 ? 'warning' : 'info',
      tab: 'operations',
      actionLabel: 'Operations',
    })
  }

  return items
}

export function AttentionPanel({
  items,
  onNavigateTab,
  pendingDeals = [],
}: {
  items: AttentionItem[]
  onNavigateTab: (tab: string) => void
  pendingDeals?: Array<{ id: string | number; name?: string; supplier_name?: string }>
}) {
  const { t } = useTranslation('admin')

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <AdminEmptyState
          title={t('attention.allClearTitle')}
          description={t('attention.allClearDescription')}
          icon={<CheckCircle2 className="h-8 w-8 text-emerald-500" />}
        />
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigateTab(item.tab)}
            className={`w-full rounded-lg border px-3 py-2 text-left transition hover:opacity-90 ${severityStyles[item.severity]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{item.label}</p>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${badgeStyles[item.severity]}`}
              >
                {badgeLabels[item.severity]}
              </span>
            </div>
            {item.detail && <p className="mt-0.5 text-xs opacity-80">{item.detail}</p>}
            {item.actionLabel && (
              <p className="mt-1 text-[10px] font-medium underline opacity-70">
                {item.actionLabel}
              </p>
            )}
          </button>
        ))
      )}
      {pendingDeals.length > 0 && (
        <div className="border-t border-[var(--app-border)] pt-2">
          <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Latest pending deals</p>
          <ul className="space-y-1.5">
            {pendingDeals.slice(0, 3).map((deal) => (
              <li key={String(deal.id)} className="text-xs">
                <button
                  type="button"
                  className="text-left text-[var(--text)] hover:underline"
                  onClick={() => onNavigateTab('deals')}
                >
                  {String(deal.name)} · {String(deal.supplier_name || 'Supplier')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
