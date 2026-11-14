import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useConsumerAuth } from '../../contexts/ConsumerAuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { PageShell } from '../../components/ui/page-shell'
import { ArrowLeft, Gift, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { ensureNamespace } from '../../i18n'
import { Progress } from '../../components/ui/progress'

function formatLedgerType(type: string, t: TFunction<'consumer'>) {
  switch (type) {
    case 'EARN':
      return t('rewards.ledgerEarned')
    case 'REDEEM':
      return t('rewards.ledgerRedeemed')
    case 'ADJUST':
      return t('rewards.ledgerAdjust')
    default:
      return type
  }
}

function fulfillmentLabel(type: string, t: TFunction<'consumer'>) {
  return t(`fulfillment.${type}`, { defaultValue: type.replace('_', ' ') })
}

function statusLabel(status: string, t: TFunction<'consumer'>) {
  return t(`orderStatus.${status}`, { defaultValue: status.replace('_', ' ') })
}

export function ConsumerRewardsPage() {
  const { t } = useTranslation('consumer')

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''
  const {
    isAuthenticated,
    isLoading,
    isError,
    member,
    loyaltyPoints,
    loyaltyProgram,
    recentLedger,
    recentOrders,
    logout,
    refreshMe,
  } = useConsumerAuth()

  if (isError && !isLoading) {
    return (
      <PageShell className="mx-auto max-w-lg space-y-4 p-4">
        <p role="alert">
          {t('rewards.loadFailed', {
            defaultValue: 'Unable to load your rewards. Please try again.',
          })}
        </p>
        <Button variant="outline" onClick={refreshMe}>
          {t('rewards.retry', { defaultValue: 'Try again' })}
        </Button>
      </PageShell>
    )
  }
  if (!isLoading && !isAuthenticated) {
    return <Navigate to={`/order/${slug}/account`} replace />
  }
  const minimumPoints = Math.max(0, Number(loyaltyProgram?.min_redeem_points ?? 0))
  const remainingPoints = Math.max(0, minimumPoints - loyaltyPoints)

  const handleLogout = async () => {
    try {
      await logout()
      toast.success(t('rewards.signedOut'))
    } catch {
      toast.error(t('rewards.unableToSignOut'))
    }
  }

  return (
    <PageShell className="mx-auto max-w-lg space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/order/${slug}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('common.back')}
          </Link>
        </Button>
        {isAuthenticated && (
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" />
            {t('common.signOut')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gift className="h-5 w-5 text-primary" />
                {t('rewards.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">
                {loyaltyPoints} {t('common.pts')}
              </p>
              {member?.displayName && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('rewards.greeting', { name: member.displayName })}
                </p>
              )}
              {loyaltyProgram?.enabled && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">
                    {remainingPoints > 0
                      ? t('rewards.pointsUntilReady', {
                          count: remainingPoints,
                          defaultValue: '{{count}} more points to use rewards',
                        })
                      : t('rewards.readyToRedeem', {
                          defaultValue: 'Ready to use your points at checkout',
                        })}
                  </p>
                  <Progress
                    value={
                      minimumPoints > 0 ? Math.min(100, (loyaltyPoints / minimumPoints) * 100) : 100
                    }
                    aria-label={t('rewards.progress', {
                      defaultValue: 'Progress toward using rewards',
                    })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('rewards.redemptionCap', {
                      percent: loyaltyProgram.max_redeem_percent ?? 50,
                      defaultValue:
                        'Use points at checkout for up to {{percent}}% of the food subtotal.',
                    })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('rewards.yourOrders')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!recentOrders.length && (
                <p className="text-sm text-muted-foreground">{t('rewards.noOrders')}</p>
              )}
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  to={
                    order.receipt_token
                      ? `/order/${slug}/receipt/${order.receipt_token}`
                      : `/order/${slug}/orders`
                  }
                  className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border p-3 transition hover:border-[var(--brand-light)]"
                >
                  <div className="min-w-0 break-words">
                    <p className="text-sm font-medium">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleString()} ·{' '}
                      {fulfillmentLabel(order.fulfillment_type, t)}
                    </p>
                  </div>
                  <Badge variant="secondary">{statusLabel(order.status, t)}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('rewards.recentActivity')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!recentLedger.length && (
                <p className="text-sm text-muted-foreground">{t('rewards.noActivity')}</p>
              )}
              {recentLedger.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{formatLedgerType(entry.entry_type, t)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={entry.points_delta >= 0 ? 'default' : 'secondary'}>
                      {entry.points_delta >= 0 ? '+' : ''}
                      {entry.points_delta} {t('common.pts')}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('common.balance', { count: entry.balance_after })}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button asChild className="w-full">
            <Link to={`/order/${slug}/menu`}>{t('rewards.orderNow')}</Link>
          </Button>
        </>
      )}
    </PageShell>
  )
}

export default ConsumerRewardsPage
