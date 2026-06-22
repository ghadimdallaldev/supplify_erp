import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetQuoteRequestsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { FileQuestion, Plus } from 'lucide-react'
import { ensureNamespace } from '../i18n'

function statusLabel(status: string, t: (key: string) => string) {
  switch (status) {
    case 'open':
      return t('status.open')
    case 'closed':
      return t('status.closed')
    case 'cancelled':
      return t('status.cancelled')
    default:
      return status
  }
}

export function QuoteRequestsPage() {
  const { t } = useTranslation('quotes')

  useEffect(() => {
    void ensureNamespace('quotes')
  }, [])

  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useGetQuoteRequestsQuery({ page: 1, limit: 50 })
  const requests = data?.quoteRequests ?? []

  return (
    <PageShell className="space-y-6" data-testid="quote-requests-page">
      <PageHeader
        title={t('requests.title')}
        description={t('requests.description')}
        actions={
          <Button onClick={() => navigate('/app/quote-requests/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('requests.requestBestPrice')}
          </Button>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          title={t('requests.loadFailedTitle')}
          description={t('requests.loadFailedDescription')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      {!isLoading && !isError && requests.length === 0 && (
        <EmptyState
          title={t('requests.emptyTitle')}
          description={t('requests.emptyDescription')}
          icon={<FileQuestion className="h-6 w-6" />}
          action={
            <Button onClick={() => navigate('/app/quote-requests/new')}>
              {t('requests.requestBestPrice')}
            </Button>
          }
        />
      )}

      {!isLoading && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((req) => (
            <Card key={req.id} className="hover:border-[var(--brand-light)] transition-colors">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {t('requests.cardTitle', {
                      date: new Date(req.createdAt).toLocaleDateString(),
                    })}
                  </CardTitle>
                  <Badge variant={req.status === 'open' ? 'default' : 'secondary'}>
                    {statusLabel(req.status, t)}
                  </Badge>
                </div>
                <CardDescription>
                  {[
                    t('requests.items', { count: req.itemCount ?? 0 }),
                    t('requests.suppliers', { count: req.supplierCount ?? 0 }),
                    t('requests.responses', { count: req.responseCount ?? 0 }),
                  ].join(' · ')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 justify-between items-center">
                {req.note && (
                  <p className="text-sm text-[var(--text-muted)] line-clamp-1 flex-1">{req.note}</p>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to={`/app/quote-requests/${req.id}`}>{t('requests.compareOffers')}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
