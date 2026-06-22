import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ensureNamespace } from '../../i18n'

export type DisputeListRow = {
  id: string
  orderId?: string
  order_id?: string
  type?: string
  status?: string
  disputedAmount?: number | null
  disputed_amount?: number | null
  restaurantName?: string
  restaurant_name?: string
}

function statusBadge(status: string) {
  const s = status?.toLowerCase()
  if (s === 'resolved') return 'default'
  if (s === 'rejected' || s === 'cancelled') return 'destructive'
  if (s === 'under_review') return 'secondary'
  return 'outline'
}

function formatOrderRef(orderId: unknown): string {
  const id = String(orderId || '')
  if (!id) return '—'
  return `#${id.slice(0, 8).toUpperCase()}`
}

function formatDisputeType(type: string, t: (key: string) => string): string {
  const key = `types.${type}`
  const translated = t(key)
  return translated === key ? type.replace(/_/g, ' ') : translated
}

function formatDisputeStatus(status: string, t: (key: string) => string): string {
  const key = `status.${status}`
  const translated = t(key)
  return translated === key ? status.replace(/_/g, ' ') : translated
}

type Props = {
  disputes: DisputeListRow[]
  isSupplier: boolean
  formatAmount: (amount: number) => string
  onReview?: (id: string) => void
  onResolve?: (id: string) => void
  onReject?: (id: string) => void
}

export function DisputeListCards({
  disputes,
  isSupplier,
  formatAmount,
  onReview,
  onResolve,
  onReject,
}: Props) {
  const { t } = useTranslation('disputes')

  useEffect(() => {
    void ensureNamespace('disputes')
  }, [])

  return (
    <div className="space-y-3 md:hidden">
      {disputes.map((dispute) => {
        const orderId = dispute.orderId || dispute.order_id
        const disputedAmount = dispute.disputedAmount ?? dispute.disputed_amount
        const status = String(dispute.status || '')
        const showSupplierActions = isSupplier && (status === 'open' || status === 'under_review')

        return (
          <Card key={dispute.id} className="overflow-visible border-[var(--app-border)]">
            <CardContent className="space-y-3 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  {orderId ? (
                    <Link
                      to={`/app/orders/${orderId}`}
                      className="font-mono text-sm font-semibold text-[var(--brand-mid)] hover:underline"
                    >
                      {formatOrderRef(orderId)}
                    </Link>
                  ) : (
                    <span className="text-sm text-[var(--text-muted)]">
                      {t('list.noOrderLinked')}
                    </span>
                  )}
                  {isSupplier && (
                    <p className="text-sm text-[var(--text-muted)] truncate">
                      {String(dispute.restaurantName ?? dispute.restaurant_name ?? '—')}
                    </p>
                  )}
                  <Link
                    to={`/app/disputes/${dispute.id}`}
                    className="text-sm capitalize text-[var(--text-mid)] hover:underline"
                  >
                    {formatDisputeType(String(dispute.type || ''), t)}
                  </Link>
                </div>
                <Badge variant={statusBadge(status)} className="shrink-0 capitalize">
                  {formatDisputeStatus(status, t)}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-3">
                <span className="text-sm font-medium text-[var(--text)]">
                  {disputedAmount != null ? formatAmount(Number(disputedAmount)) : '—'}
                </span>
                {showSupplierActions && (
                  <div className="action-bar w-full sm:w-auto">
                    {status === 'open' && onReview && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[40px] flex-1 sm:flex-none"
                        onClick={() => onReview(dispute.id)}
                      >
                        {t('list.review')}
                      </Button>
                    )}
                    {onResolve && (
                      <Button
                        size="sm"
                        className="min-h-[40px] flex-1 sm:flex-none"
                        onClick={() => onResolve(dispute.id)}
                      >
                        {t('list.resolve')}
                      </Button>
                    )}
                    {onReject && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[40px] flex-1 sm:flex-none"
                        onClick={() => onReject(dispute.id)}
                      >
                        {t('list.reject')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export { formatOrderRef, statusBadge }
