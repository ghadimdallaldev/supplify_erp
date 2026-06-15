import { formatPrice } from '../../utils/format'
import { SummaryStrip } from '../ui/app-panel'

type InvoiceStatsCardsProps = {
  stats: {
    total: number
    unpaid: number
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
  return (
    <div className="space-y-4">
      <SummaryStrip
        testId="invoice-summary-primary"
        metrics={[
          {
            label: 'Total invoices',
            value: stats.total,
            hint: `${analytics.issued_count || 0} issued · ${analytics.partial_count || 0} partial`,
          },
          {
            label: 'Outstanding',
            value: formatPrice(stats.totalOutstanding),
            tone: 'amber',
            hint: `${stats.unpaid} unpaid`,
          },
          {
            label: 'Overdue',
            value: stats.overdue,
            tone: stats.overdue > 0 ? 'danger' : 'default',
            hint: overdueData?.summary?.totalOverdue
              ? formatPrice(overdueData.summary.totalOverdue)
              : 'All current',
          },
          {
            label: 'Total paid',
            value: formatPrice(stats.totalPaid),
            tone: 'mint',
            hint: `${analytics.paid_count || 0} paid`,
          },
        ]}
      />

      {analyticsData ? (
        <SummaryStrip
          testId="invoice-summary-analytics"
          metrics={[
            {
              label: 'Avg days to pay',
              value:
                analytics.avg_days_to_pay != null
                  ? `${parseInt(String(analytics.avg_days_to_pay), 10)} days`
                  : 'N/A',
            },
            {
              label: 'Paid (30d)',
              value: formatPrice(analytics.total_paid_amount),
              tone: 'mint',
            },
            {
              label: 'Outstanding (30d)',
              value: formatPrice(analytics.total_outstanding),
              tone: 'amber',
            },
          ]}
        />
      ) : null}
    </div>
  )
}
