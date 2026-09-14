import type { TFunction } from 'i18next'
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
  critical:
    'border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[var(--red-pale)] text-[var(--red)]',
  warning:
    'border-[color-mix(in_srgb,var(--amber)_35%,transparent)] bg-[var(--amber-pale)] text-[var(--amber)]',
  info: 'border-[var(--app-border-mid)] bg-[var(--brand-ultra)] text-[var(--brand-mid)]',
  healthy:
    'border-[color-mix(in_srgb,var(--mint)_35%,transparent)] bg-[var(--mint-pale)] text-[var(--mint)]',
}

const badgeStyles: Record<AttentionSeverity, string> = {
  critical: 'bg-[color-mix(in_srgb,var(--red)_18%,transparent)] text-[var(--red)]',
  warning: 'bg-[color-mix(in_srgb,var(--amber)_18%,transparent)] text-[var(--amber)]',
  info: 'bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand-mid)]',
  healthy: 'bg-[color-mix(in_srgb,var(--mint)_18%,transparent)] text-[var(--mint)]',
}

export function buildAttentionItems(
  overview: Record<string, unknown> | undefined,
  options: {
    pendingApproval?: number
    pendingPayment?: number
    recentErrorCount?: number
  } = {},
  t: TFunction
): AttentionItem[] {
  const alerts = (overview?.alerts || {}) as Record<string, number>
  const operational = (overview?.operational || {}) as Record<string, number>
  const items: AttentionItem[] = []

  const pendingApproval = Number(options.pendingApproval ?? alerts.pendingDealApprovals ?? 0)
  if (pendingApproval > 0) {
    items.push({
      id: 'deals-pending',
      label: t('attention.dealsPending', { count: pendingApproval }),
      detail: t('attention.dealsPendingDetail'),
      severity: 'warning',
      tab: 'deals',
      actionLabel: t('attention.reviewDeals'),
    })
  }

  const pendingPayment = Number(options.pendingPayment ?? alerts.pendingDealPayments ?? 0)
  if (pendingPayment > 0) {
    items.push({
      id: 'deals-payment',
      label: t('attention.dealsPayment', { count: pendingPayment }),
      detail: t('attention.dealsPaymentDetail'),
      severity: 'info',
      tab: 'deals',
      actionLabel: t('attention.reviewDeals'),
    })
  }

  const pastDue = Number(alerts.pastDueSubscriptions || 0)
  if (pastDue > 0) {
    items.push({
      id: 'past-due',
      label: t('attention.pastDue', { count: pastDue }),
      detail: t('attention.pastDueDetail'),
      severity: 'critical',
      tab: 'subscriptions',
      actionLabel: t('attention.reviewSubscriptions'),
    })
  }

  const trialsExpiring = Number(alerts.trialsExpiringSoon || 0)
  if (trialsExpiring > 0) {
    items.push({
      id: 'trials',
      label: t('attention.trialsExpiring', { count: trialsExpiring }),
      severity: 'warning',
      tab: 'subscriptions',
      actionLabel: t('attention.reviewSubscriptions'),
    })
  }

  const healthIssues = Number(options.recentErrorCount ?? alerts.healthErrors ?? 0)
  if (healthIssues > 0) {
    items.push({
      id: 'health',
      label: t('attention.healthErrors', { count: healthIssues }),
      detail: t('attention.healthErrorsDetail'),
      severity: 'critical',
      tab: 'health',
      actionLabel: t('attention.viewHealth'),
    })
  }

  const overdueInvoices = Number(alerts.overdueInvoices || 0)
  if (overdueInvoices > 0) {
    items.push({
      id: 'overdue-invoices',
      label: t('attention.overdueInvoices', { count: overdueInvoices }),
      severity: 'warning',
      tab: 'finance',
      actionLabel: t('attention.openFinance'),
    })
  }

  const emailFailed = Number(operational.emailFailed24h || 0)
  if (emailFailed >= 1) {
    items.push({
      id: 'email-failures',
      label: t('attention.emailFailed', { count: emailFailed }),
      detail: t('attention.emailFailedDetail'),
      severity: emailFailed >= 5 ? 'warning' : 'info',
      tab: 'operations',
      actionLabel: t('attention.operations'),
    })
  }

  const openFulfillment = Number(operational.openFulfillmentIssues || 0)
  if (openFulfillment >= 1) {
    items.push({
      id: 'fulfillment-issues',
      label: t('attention.fulfillmentIssues', { count: openFulfillment }),
      severity: openFulfillment >= 10 ? 'warning' : 'info',
      tab: 'operations',
      actionLabel: t('attention.operations'),
    })
  }

  const staleGps = Number(operational.staleGpsDeliveries || 0)
  if (staleGps >= 1) {
    items.push({
      id: 'stale-gps',
      label: t('attention.staleGps', { count: staleGps }),
      severity: staleGps >= 10 ? 'warning' : 'info',
      tab: 'operations',
      actionLabel: t('attention.operations'),
    })
  }

  const expiredLots = Number(operational.expiredInventoryLots || 0)
  if (expiredLots >= 1) {
    items.push({
      id: 'expired-lots',
      label: t('attention.expiredLots', { count: expiredLots }),
      severity: expiredLots >= 20 ? 'warning' : 'info',
      tab: 'operations',
      actionLabel: t('attention.operations'),
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
          icon={<CheckCircle2 className="h-8 w-8 text-[var(--mint)]" />}
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
                {t(`attention.severity.${item.severity}`)}
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
          <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
            {t('attention.latestPendingDeals')}
          </p>
          <ul className="space-y-1.5">
            {pendingDeals.slice(0, 3).map((deal) => (
              <li key={String(deal.id)} className="text-xs">
                <button
                  type="button"
                  className="text-left text-[var(--text)] hover:underline"
                  onClick={() => onNavigateTab('deals')}
                >
                  {String(deal.name)} · {String(deal.supplier_name || t('common.supplier'))}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
