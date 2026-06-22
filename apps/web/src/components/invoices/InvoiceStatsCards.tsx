import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../utils/format'
import { SummaryStrip } from '../ui/app-panel'

type InvoiceStatsCardsProps = {
  stats: {
    total: number
    unpaid: number
    paidCount: number
    overdue: number
    totalOutstanding: number
    totalPaid: number
  }
  analytics: {
    issued_count?: number
    partial_count?: number
    paid_count?: number
    avg_days_to_pay?: string | number
    total_paid_amount?: string | number
    total_outstanding?: string | number
  }
  analyticsData: unknown
  overdueData: { summary?: { totalOverdue?: number } } | undefined
}

export function InvoiceStatsCards({
  stats,
  analytics,
  analyticsData,
  overdueData,
}: InvoiceStatsCardsProps) {
  const { t } = useTranslation('invoices')

  return (
    <div className="space-y-4">
      <SummaryStrip
        testId="invoice-summary-primary"
        metrics={[
          {
            label: t('stats.totalInvoices'),
            value: stats.total,
            hint: t('stats.issuedPartial', {
              issued: analytics.issued_count || 0,
              partial: analytics.partial_count || 0,
            }),
          },
          {
            label: t('stats.outstanding'),
            value: formatPrice(stats.totalOutstanding),
            tone: 'amber',
            hint: t('stats.unpaid', { count: stats.unpaid }),
          },
          {
            label: t('stats.overdue'),
            value: stats.overdue,
            tone: stats.overdue > 0 ? 'danger' : 'default',
            hint: overdueData?.summary?.totalOverdue
              ? formatPrice(overdueData.summary.totalOverdue)
              : t('stats.allCurrent'),
          },
          {
            label: t('stats.totalPaid'),
            value: formatPrice(stats.totalPaid),
            tone: 'mint',
            hint:
              stats.paidCount > 0
                ? t('stats.paidCount', { count: stats.paidCount })
                : t('stats.noPaidYet'),
          },
        ]}
      />

      {analyticsData ? (
        <SummaryStrip
          testId="invoice-summary-analytics"
          metrics={[
            {
              label: t('stats.avgDaysToPay'),
              value:
                analytics.avg_days_to_pay != null
                  ? t('stats.days', { count: parseInt(String(analytics.avg_days_to_pay), 10) })
                  : t('stats.na'),
            },
            {
              label: t('stats.paid30d'),
              value: formatPrice(analytics.total_paid_amount),
              tone: 'mint',
            },
            {
              label: t('stats.outstanding30d'),
              value: formatPrice(analytics.total_outstanding),
              tone: 'amber',
            },
          ]}
        />
      ) : null}
    </div>
  )
}
