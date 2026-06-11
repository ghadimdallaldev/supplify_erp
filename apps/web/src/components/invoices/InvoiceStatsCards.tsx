import {
  FileText,
  Clock,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent } from '../ui/card'
import { formatPrice } from '../../utils/format'

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
    <>
      {/* Comprehensive Analytics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-muted)]">Total Invoices</p>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {analytics.issued_count || 0} issued • {analytics.partial_count || 0} partial
                </p>
              </div>
              <FileText className="h-10 w-10 text-[var(--brand-mid)]" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-muted)]">Outstanding</p>
                <p className="text-2xl font-bold text-[var(--amber)]">
                  {formatPrice(stats.totalOutstanding)}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {stats.unpaid} unpaid invoices
                </p>
              </div>
              <Clock className="h-10 w-10 text-[var(--amber-mid)]" />
            </div>
          </CardContent>
        </Card>

        <Card className={stats.overdue > 0 ? 'border-[var(--red)]/40' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-muted)]">Overdue</p>
                <p className="text-2xl font-bold text-[var(--red)]">{stats.overdue}</p>
                <p className="text-xs text-[var(--red)] mt-1">
                  {overdueData?.summary?.totalOverdue
                    ? formatPrice(overdueData.summary.totalOverdue)
                    : 'All current'}
                </p>
              </div>
              <AlertTriangle className="h-10 w-10 text-[var(--red)]" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--text-muted)]">Total Paid</p>
                <p className="text-2xl font-bold text-[var(--mint)]">
                  {formatPrice(stats.totalPaid)}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {analytics.paid_count || 0} paid invoices
                </p>
              </div>
              <CheckCircle className="h-10 w-10 text-[var(--mint)]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row */}
      {analyticsData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Avg Days to Pay</p>
                  <p className="text-xl font-semibold">
                    {analytics.avg_days_to_pay != null
                      ? `${parseInt(String(analytics.avg_days_to_pay), 10)} days`
                      : 'N/A'}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-[var(--text-muted)]" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Total Paid (30d)</p>
                  <p className="text-xl font-semibold text-[var(--mint)]">
                    {formatPrice(analytics.total_paid_amount)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-[var(--mint)]" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Outstanding (30d)</p>
                  <p className="text-xl font-semibold text-[var(--amber)]">
                    {formatPrice(analytics.total_outstanding)}
                  </p>
                </div>
                <TrendingDown className="h-8 w-8 text-[var(--amber-mid)]" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
