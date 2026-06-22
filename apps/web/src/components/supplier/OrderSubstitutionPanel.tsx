import { useTranslation } from 'react-i18next'
import {
  useGetOrderSubstitutionsQuery,
  useProposeOrderSubstitutionMutation,
} from '../../services/api'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'

export function OrderSubstitutionPanel({ orderId }: { orderId: string }) {
  const { t } = useTranslation('suppliers')
  const { data, isLoading, isError, refetch } = useGetOrderSubstitutionsQuery(orderId)
  const [propose, { isLoading: proposing }] = useProposeOrderSubstitutionMutation()

  const suggestions = data?.suggestions || []

  const handlePropose = async (orderItemId: string, substituteProductId: string, name: string) => {
    try {
      await propose({
        orderId,
        orderItemId,
        substituteProductId,
        description: t('substitution.proposeDescription', { name }),
      }).unwrap()
      toast.success(t('substitution.proposeSuccess'))
      refetch()
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('substitution.proposeFailed'))
    }
  }

  if (isLoading) {
    return (
      <div data-testid="order-substitution-loading" className="mt-4">
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        data-testid="order-substitution-error"
        className="mt-4 rounded-xl border border-[var(--app-border)] p-4 text-center text-sm text-[var(--text-muted)]"
      >
        <AlertTriangle className="h-4 w-4 mx-auto mb-2 text-[var(--brand)]" />
        {t('substitution.loadError')}
      </div>
    )
  }

  if (!suggestions.length) {
    return (
      <p
        data-testid="order-substitution-empty"
        className="text-xs text-[var(--text-muted)] mt-4 rounded-lg border border-dashed border-[var(--app-border)] px-3 py-3"
      >
        {t('substitution.empty')}
      </p>
    )
  }

  const pendingAmendments = data?.amendments?.filter(
    (a: { status: string }) => a.status === 'pending'
  )

  return (
    <div
      data-testid="order-substitution-panel"
      className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
    >
      <h3 className="text-sm font-extrabold mb-1">{t('substitution.title')}</h3>
      <p className="text-xs text-[var(--text-muted)] mb-3">{t('substitution.description')}</p>

      {pendingAmendments && pendingAmendments.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-3">
          {t('substitution.pending', { count: pendingAmendments.length })}
        </p>
      )}

      {suggestions.map(
        (block: {
          orderItemId: string
          productId: string
          productName?: string
          substitutes: Array<{
            id: string
            substituteProductId: string
            substituteName: string
            priceDifference?: number
          }>
        }) => (
          <div
            key={block.orderItemId}
            className="mb-3 last:mb-0 pb-3 last:pb-0 border-b last:border-0 border-[var(--app-border)]"
          >
            <div className="text-xs font-bold text-[var(--text)] mb-2">
              {block.productName || t('substitution.orderLine')}
            </div>
            {block.substitutes.map((sub) => (
              <div key={sub.id} className="flex justify-between items-center gap-2 text-xs py-1.5">
                <span>
                  → {sub.substituteName}
                  {sub.priceDifference != null && sub.priceDifference !== 0 && (
                    <span className="text-[var(--text-muted)] ml-1">
                      ({sub.priceDifference > 0 ? '+' : ''}
                      {Number(sub.priceDifference).toFixed(2)})
                    </span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={proposing}
                  data-testid={`propose-substitute-${block.orderItemId}-${sub.substituteProductId}`}
                  onClick={() =>
                    handlePropose(block.orderItemId, sub.substituteProductId, sub.substituteName)
                  }
                >
                  {t('substitution.propose')}
                </Button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
