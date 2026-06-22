import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useGetSupplierReorderAssistanceQuery,
  useCreateReorderReminderDraftMutation,
  useGetEntitlementsQuery,
} from '../../services/api'
import { featureEnabled } from '../../lib/planLimits'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { EmptyState } from '../ui/empty-state'
import { MessageCircle, History, Bell, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { useState } from 'react'
import { ReorderReminderReviewDialog, type ReminderDraft } from './ReorderReminderReviewDialog'

const URGENCY_STYLES: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-amber-100 text-amber-900',
  LOW: 'bg-slate-100 text-slate-700',
}

export function SupplierFollowUpPanel({ className }: { className?: string }) {
  const { t } = useTranslation('suppliers')
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const smartReorderEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.smart_reorder
  )
  const { data, isLoading, isError, refetch } = useGetSupplierReorderAssistanceQuery(undefined, {
    skip: !smartReorderEnabled,
  })
  const [createDraft, { isLoading: drafting }] = useCreateReorderReminderDraftMutation()
  const [draft, setDraft] = useState<ReminderDraft | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [busyRestaurantId, setBusyRestaurantId] = useState<string | null>(null)

  const suggestions = data?.suggestions ?? []

  const handleMessage = async (restaurantId: string, openChat: boolean) => {
    setBusyRestaurantId(restaurantId)
    try {
      const result = await createDraft({ restaurantId, openChat }).unwrap()
      const d = result?.draft
      if (!d) {
        toast.error(t('followUp.toast.createFailed'))
        return
      }
      if (openChat && d.chatUrl) {
        window.location.href = d.chatUrl
        toast.success(t('followUp.toast.openingChat'))
        return
      }
      setDraft(d)
      setDraftOpen(true)
    } catch (e: any) {
      toast.error(e?.data?.error?.message || t('followUp.toast.prepareFailed'))
    } finally {
      setBusyRestaurantId(null)
    }
  }

  if (!smartReorderEnabled) {
    return null
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="py-6">
          <EmptyState
            title={t('followUp.loadError')}
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t('common:actions.retry')}
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={className} data-testid="supplier-follow-up-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-[var(--brand-mid)]" />
            {t('followUp.title')}
          </CardTitle>
          <CardDescription>{t('followUp.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {suggestions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">
              {t('followUp.empty')}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--app-border)]">
              {suggestions.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{item.restaurantName}</span>
                        <Badge
                          className={cn(
                            'text-xs',
                            URGENCY_STYLES[item.urgency] || URGENCY_STYLES.MEDIUM
                          )}
                        >
                          {item.reasonCode === 'churn_risk'
                            ? t('followUp.churnRisk')
                            : t(`followUp.urgency.${item.urgency}`, {
                                defaultValue: item.urgency,
                              })}
                        </Badge>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1">{item.reasonLabel}</p>
                      {item.detail && (
                        <p className="text-xs text-[var(--text-mid)] mt-0.5">{item.detail}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/app/orders?restaurantId=${item.restaurantId}`}>
                          <History className="h-3.5 w-3.5 mr-1" />
                          {t('followUp.history')}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={drafting && busyRestaurantId === item.restaurantId}
                        onClick={() => handleMessage(item.restaurantId, false)}
                      >
                        <Bell className="h-3.5 w-3.5 mr-1" />
                        {t('followUp.reminder')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={drafting && busyRestaurantId === item.restaurantId}
                        onClick={() => handleMessage(item.restaurantId, true)}
                      >
                        {drafting && busyRestaurantId === item.restaurantId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <MessageCircle className="h-3.5 w-3.5 mr-1" />
                            {t('followUp.message')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ReorderReminderReviewDialog
        draft={draft}
        open={draftOpen}
        onClose={() => {
          setDraftOpen(false)
          setDraft(null)
        }}
      />
    </>
  )
}
