import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetSupplierQuoteInboxQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { Inbox } from 'lucide-react'
import { ensureNamespace } from '../i18n'

function statusLabel(status: string, t: (key: string) => string) {
  switch (status) {
    case 'pending':
      return t('status.pending')
    case 'responded':
      return t('status.responded')
    case 'declined':
      return t('status.declined')
    default:
      return status
  }
}

export function SupplierQuoteInboxPage() {
  const { t } = useTranslation('quotes')

  useEffect(() => {
    void ensureNamespace('quotes')
  }, [])

  const { data, isLoading, isError, refetch } = useGetSupplierQuoteInboxQuery({
    page: 1,
    limit: 50,
  })
  const inbox = data?.inbox ?? []

  return (
    <PageShell className="space-y-6" data-testid="supplier-quote-inbox-page">
      <PageHeader title={t('inbox.title')} description={t('inbox.description')} />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          title={t('inbox.loadFailedTitle')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      {!isLoading && !isError && inbox.length === 0 && (
        <EmptyState
          title={t('inbox.emptyTitle')}
          description={t('inbox.emptyDescription')}
          icon={<Inbox className="h-6 w-6" />}
        />
      )}

      {!isLoading && inbox.length > 0 && (
        <div className="space-y-3">
          {inbox.map((entry) => (
            <Card key={entry.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{entry.restaurantName}</CardTitle>
                  <Badge variant={entry.status === 'pending' ? 'secondary' : 'default'}>
                    {statusLabel(entry.status, t)}
                  </Badge>
                </div>
                <CardDescription>
                  {[
                    t('inbox.items', { count: entry.itemCount }),
                    new Date(entry.createdAt).toLocaleDateString(),
                    entry.neededBy ? t('inbox.neededBy', { date: entry.neededBy }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end">
                <Button asChild size="sm">
                  <Link to={`/app/quote-requests/supplier/${entry.id}`}>
                    {entry.status === 'responded' ? t('inbox.viewResponse') : t('inbox.respond')}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
