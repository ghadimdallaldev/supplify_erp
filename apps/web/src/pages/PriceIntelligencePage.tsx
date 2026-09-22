import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Lock, TrendingUp } from 'lucide-react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { RequirePermission } from '../components/RequirePermission'
import { Skeleton } from '../components/ui/skeleton'
import { TableScroll } from '../components/ui/table-scroll'
import { ensureNamespace } from '../i18n'
import { meetsIntelligenceTier } from '../lib/planLimits'
import { useGetEntitlementsQuery } from '../services/api'
import {
  useGetCheaperBuyOptionsQuery,
  useGetPriceChangeAlertsQuery,
} from '../services/api/endpoints/priceIntelligence'
import { formatPrice } from '../utils/format'

const WINDOW_OPTIONS = [30, 90, 180] as const

function formatPct(value: number | null): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString()
}

export function PriceIntelligencePage() {
  const { t } = useTranslation('inventory')
  const [days, setDays] = useState<(typeof WINDOW_OPTIONS)[number]>(30)

  // The payload is `{ entitlements: {...} }`, not the entitlements object.
  const { data: entitlementsData } = useGetEntitlementsQuery()
  // The API is authoritative; this only avoids rendering a surface it refuses.
  const hasAdvanced = meetsIntelligenceTier(entitlementsData?.entitlements, 'advanced')

  useEffect(() => {
    void ensureNamespace('inventory')
  }, [])

  const changes = useGetPriceChangeAlertsQuery({ days }, { skip: !hasAdvanced })
  const cheaper = useGetCheaperBuyOptionsQuery({ days }, { skip: !hasAdvanced })

  const isLoading = changes.isLoading || cheaper.isLoading
  const isError = changes.isError || cheaper.isError

  const retry = () => {
    void changes.refetch()
    void cheaper.refetch()
  }

  return (
    <RequirePermission permission="CATALOG_VIEW" title={t('priceIntelligence.title')}>
      <PageShell maxWidth="wide" data-testid="price-intelligence-page">
        <PageHeader
          title={t('priceIntelligence.title')}
          description={t('priceIntelligence.description')}
          actions={
            hasAdvanced ? (
              <div
                className="flex gap-2"
                role="group"
                aria-label={t('priceIntelligence.windowLabel')}
              >
                {WINDOW_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    variant={days === option ? 'default' : 'outline'}
                    aria-pressed={days === option}
                    onClick={() => setDays(option)}
                  >
                    {t(`priceIntelligence.days${option}`)}
                  </Button>
                ))}
              </div>
            ) : null
          }
        />

        {!hasAdvanced && (
          <EmptyState
            icon={<Lock className="h-6 w-6" />}
            title={t('priceIntelligence.upgradeTitle')}
            description={t('priceIntelligence.upgradeDesc')}
            action={
              <Button variant="outline" asChild>
                <Link to="/app/settings?tab=subscription">{t('priceIntelligence.viewPlans')}</Link>
              </Button>
            }
          />
        )}

        {hasAdvanced && isLoading && (
          <div className="grid gap-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        )}

        {hasAdvanced && isError && (
          <EmptyState
            title={t('priceIntelligence.loadErrorTitle')}
            description={t('priceIntelligence.loadErrorDesc')}
            action={
              <Button variant="outline" onClick={retry}>
                {t('priceIntelligence.retry')}
              </Button>
            }
          />
        )}

        {hasAdvanced && !isLoading && !isError && (
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  {t('priceIntelligence.changes.title')}
                </CardTitle>
                <CardDescription>{t('priceIntelligence.changes.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                {!changes.data?.alerts.length ? (
                  <p className="text-sm text-muted-foreground">
                    {t('priceIntelligence.changes.empty')}
                  </p>
                ) : (
                  <TableScroll>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-4">{t('priceIntelligence.changes.product')}</th>
                          <th className="py-2 pr-4">{t('priceIntelligence.changes.supplier')}</th>
                          <th className="py-2 pr-4">{t('priceIntelligence.changes.was')}</th>
                          <th className="py-2 pr-4">{t('priceIntelligence.changes.now')}</th>
                          <th className="py-2 pr-4">{t('priceIntelligence.changes.change')}</th>
                          <th className="py-2 pr-4">{t('priceIntelligence.changes.source')}</th>
                          <th className="py-2">{t('priceIntelligence.changes.detected')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.data.alerts.map((alert) => (
                          <tr key={alert.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{alert.productName ?? '—'}</td>
                            <td className="py-2 pr-4">{alert.supplierName ?? '—'}</td>
                            <td className="py-2 pr-4">
                              {alert.oldPrice != null ? formatPrice(alert.oldPrice) : '—'}
                            </td>
                            <td className="py-2 pr-4">
                              {alert.newPrice != null ? formatPrice(alert.newPrice) : '—'}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge
                                variant={alert.severity === 'high' ? 'destructive' : 'secondary'}
                              >
                                {formatPct(alert.changePct)}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">{alert.source}</td>
                            <td className="py-2 text-muted-foreground">
                              {formatDate(alert.detectedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('priceIntelligence.cheaper.title')}</CardTitle>
                <CardDescription>{t('priceIntelligence.cheaper.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                {!cheaper.data?.options.length ? (
                  <p className="text-sm text-muted-foreground">
                    {t('priceIntelligence.cheaper.empty')}
                  </p>
                ) : (
                  <ul className="grid gap-4">
                    {cheaper.data.options.map((option) => (
                      <li key={option.productId} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium">{option.productName ?? '—'}</span>
                          <span className="text-sm text-muted-foreground">
                            {t('priceIntelligence.cheaper.currentlyPaying')}{' '}
                            {formatPrice(option.currentPrice)}
                          </span>
                        </div>
                        <ul className="mt-3 grid gap-2">
                          {option.alternatives.map((alt) => (
                            <li
                              key={`${alt.kind}-${alt.productId}`}
                              className="flex flex-wrap items-center gap-2 text-sm"
                            >
                              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <Badge variant="outline">
                                {alt.kind === 'contract_price'
                                  ? t('priceIntelligence.cheaper.contractPrice')
                                  : t('priceIntelligence.cheaper.supplierSubstitute')}
                              </Badge>
                              <span>{alt.productName ?? '—'}</span>
                              <span className="font-medium">{formatPrice(alt.price)}</span>
                              <span className="text-muted-foreground">
                                {t('priceIntelligence.cheaper.saving')}{' '}
                                {formatPrice(alt.savingPerUnit)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageShell>
    </RequirePermission>
  )
}
