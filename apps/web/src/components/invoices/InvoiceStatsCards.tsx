import { useTranslation } from 'react-i18next'
import { formatCurrency, formatPrice } from '../../utils/format'

function moneyLabel(amount: number | string | null | undefined, currency?: string | null) {
  const code = String(currency || '')
    .trim()
    .toUpperCase()
  if (/^[A-Z]{3}$/.test(code)) return formatCurrency(amount ?? 0, { currency: code })
  return formatPrice(amount ?? 0)
}
import { SummaryStrip } from '../ui/app-panel'

function formatMoneyParts(
  value: number | string | null | undefined,
  parts?: Array<{ currency?: string; amount?: number }>
) {
  if (parts && parts.length > 0) {
    return parts.map((part) => moneyLabel(part.amount ?? 0, part.currency)).join(' · ')
  }
  if (value == null || value === '') return '—'
  return formatPrice(value)
}

type InvoiceStatsCardsProps = {
  stats: {
    total: number
    unpaid: number
    paidCount: number
    overdue: number
    totalOutstanding: number | null
    outstandingByCurrency?: Array<{ currency: string; amount: number }>
    totalPaid: number | null
    paidByCurrency?: Array<{ currency: string; amount: number }>
  }
  analytics: {
    issued_count?: number
    partial_count?: number
    paid_count?: number
    avg_days_to_pay?: string | number
    total_paid_amount?: string | number | null
    total_outstanding?: string | number | null
    money_by_currency?: Array<{
      currency?: string
      total_outstanding?: number
      total_paid_amount?: number
    }>
  }
  analyticsData: unknown
  overdueData:
    | {
        summary?: {
          totalOverdue?: number | null
          count?: number
          byCurrency?: Array<{ currency: string; amount: number }>
        }
      }
    | undefined
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
            value: formatMoneyParts(stats.totalOutstanding, stats.outstandingByCurrency),
            tone: 'amber',
            hint: t('stats.unpaid', { count: stats.unpaid }),
          },
          {
            label: t('stats.overdue'),
            value: stats.overdue,
            tone: stats.overdue > 0 ? 'danger' : 'default',
            hint:
              overdueData?.summary?.byCurrency && overdueData.summary.byCurrency.length > 0
                ? overdueData.summary.byCurrency
                    .map((row) => moneyLabel(row.amount, row.currency))
                    .join(' · ')
                : overdueData?.summary?.totalOverdue
                  ? formatPrice(overdueData.summary.totalOverdue)
                  : t('stats.allCurrent'),
          },
          {
            label: t('stats.totalPaid'),
            value: formatMoneyParts(stats.totalPaid, stats.paidByCurrency),
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
              value: formatMoneyParts(
                analytics.total_paid_amount,
                analytics.money_by_currency?.map((row) => ({
                  currency: row.currency,
                  amount: row.total_paid_amount,
                }))
              ),
              tone: 'mint',
            },
            {
              label: t('stats.outstanding30d'),
              value: formatMoneyParts(
                analytics.total_outstanding,
                analytics.money_by_currency?.map((row) => ({
                  currency: row.currency,
                  amount: row.total_outstanding,
                }))
              ),
              tone: 'amber',
            },
          ]}
        />
      ) : null}
    </div>
  )
}
