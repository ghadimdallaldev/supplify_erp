import {
  useGetAdminFeaturedPlacementsQuery,
  useApproveFeaturedPlacementMutation,
  useRejectFeaturedPlacementMutation,
  useRefundFeaturedPlacementMutation,
} from '../../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function AdminFeaturedPlacementsPanel() {
  const { t } = useTranslation('admin')
  const { data, isLoading, refetch } = useGetAdminFeaturedPlacementsQuery()
  const [refundFeatured] = useRefundFeaturedPlacementMutation()
  const [approveFeatured] = useApproveFeaturedPlacementMutation()
  const [rejectFeatured] = useRejectFeaturedPlacementMutation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const placements = data?.placements ?? []

  const handleRefund = async (id: string) => {
    setBusyId(id)
    try {
      await refundFeatured({ id, reason: 'admin_refund' }).unwrap()
      toast.success(t('placements.refundSuccess'))
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('placements.refundFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleReview = async (id: string, approve: boolean) => {
    setBusyId(id)
    try {
      if (approve) {
        await approveFeatured({ id }).unwrap()
        toast.success(t('placements.approveSuccess'))
      } else {
        const reason = window.prompt(t('placements.rejectReasonPrompt')) || undefined
        await rejectFeatured({ id, reason }).unwrap()
        toast.success(t('placements.rejectSuccess'))
      }
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('placements.reviewFailed'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card data-testid="admin-featured-placements-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-[var(--amber)]" />
          {t('placements.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : placements.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('placements.empty')}</p>
        ) : (
          <ul className="divide-y divide-[var(--app-border)]">
            {placements.map((p: any) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.supplier_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {p.status === 'pending'
                      ? p.payment_status === 'paid' || p.payment_status === 'waived'
                        ? t('placements.awaitingReview')
                        : t('placements.awaitingPayment')
                      : t('placements.until', {
                          date: new Date(p.ends_at).toLocaleDateString(),
                        })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{p.pricing_key}</Badge>
                  {p.status === 'pending' &&
                  (p.payment_status === 'paid' || p.payment_status === 'waived') ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === p.id}
                        onClick={() => handleReview(p.id, true)}
                      >
                        {busyId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          t('placements.approve')
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === p.id}
                        onClick={() => handleReview(p.id, false)}
                      >
                        {t('placements.reject')}
                      </Button>
                    </>
                  ) : p.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === p.id}
                      onClick={() => handleRefund(p.id)}
                    >
                      {busyId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t('placements.refund')
                      )}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
