import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useGetSupplierQuoteInboxQuery,
  useDeclineSupplierQuoteRequestMutation,
} from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { Inbox, Search, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { ensureNamespace } from '../i18n'
import type {
  SupplierQuoteInboxEntry,
  SupplierQuoteInboxSort,
  SupplierQuoteInboxStatus,
} from '../types'

const PAGE_SIZE = 20
const TABS: Array<{ key: 'all' | SupplierQuoteInboxStatus; countKey: string }> = [
  { key: 'all', countKey: 'total' },
  { key: 'pending', countKey: 'pending' },
  { key: 'responded', countKey: 'responded' },
  { key: 'declined', countKey: 'declined' },
]
const SORTS: SupplierQuoteInboxSort[] = ['newest', 'oldest', 'needed_by']

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

/** Whole days from today to `date`; negative once the date has passed. */
function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`)
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function UrgencyBadge({ neededBy }: { neededBy: string }) {
  const { t } = useTranslation('quotes')
  const days = daysUntil(neededBy)
  if (!Number.isFinite(days) || days > 2) return null
  const overdue = days < 0
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      {overdue
        ? t('inbox.overdue')
        : days === 0
          ? t('inbox.dueToday')
          : t('inbox.dueInDays', { count: days })}
    </Badge>
  )
}

function InboxCard({
  entry,
  onDecline,
  declining,
}: {
  entry: SupplierQuoteInboxEntry
  onDecline: (entry: SupplierQuoteInboxEntry) => void
  declining: boolean
}) {
  const { t } = useTranslation('quotes')
  const requestOpen = entry.quoteRequestStatus === 'open'
  const isUnread = entry.status === 'pending' && !entry.viewedAt

  return (
    <Card data-testid="quote-inbox-card" className={isUnread ? 'border-[var(--brand)]' : undefined}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {isUnread && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]"
                aria-label={t('inbox.unread')}
              />
            )}
            {entry.restaurantName}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {entry.status === 'pending' && requestOpen && entry.neededBy && (
              <UrgencyBadge neededBy={entry.neededBy} />
            )}
            {!requestOpen && (
              <Badge variant="outline">{statusLabel(entry.quoteRequestStatus, t)}</Badge>
            )}
            <Badge variant={entry.status === 'pending' ? 'secondary' : 'default'}>
              {statusLabel(entry.status, t)}
            </Badge>
          </div>
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
      <CardContent className="space-y-3">
        {entry.status === 'declined' && entry.declineReason && (
          <p className="text-sm text-[var(--text-muted)]">
            {t('inbox.declinedReason', { reason: entry.declineReason })}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {entry.status === 'pending' && requestOpen && (
            <Button
              variant="outline"
              size="sm"
              disabled={declining}
              onClick={() => onDecline(entry)}
              data-testid="quote-inbox-decline"
            >
              {t('inbox.decline')}
            </Button>
          )}
          <Button asChild size="sm">
            <Link to={`/app/quote-requests/supplier/${entry.id}`}>
              {entry.status === 'pending' && requestOpen
                ? t('inbox.respond')
                : t('inbox.viewResponse')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SupplierQuoteInboxPage() {
  const { t } = useTranslation('quotes')

  useEffect(() => {
    void ensureNamespace('quotes')
  }, [])

  const [tab, setTab] = useState<'all' | SupplierQuoteInboxStatus>('all')
  const [sort, setSort] = useState<SupplierQuoteInboxSort>('newest')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Debounce so typing a restaurant name does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [searchInput])

  const { data, isLoading, isFetching, isError, refetch } = useGetSupplierQuoteInboxQuery({
    page,
    limit: PAGE_SIZE,
    ...(tab === 'all' ? {} : { status: tab }),
    ...(search ? { search } : {}),
    sort,
  })
  const [declineQuote, { isLoading: declining }] = useDeclineSupplierQuoteRequestMutation()

  const inbox = data?.inbox ?? []
  const counts = data?.counts
  const total = data?.pagination.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // A filter change can leave us past the end of a now-shorter result set.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const handleDecline = async (entry: SupplierQuoteInboxEntry) => {
    const reason = window.prompt(t('inbox.declinePrompt', { restaurant: entry.restaurantName }))
    if (reason === null) return
    try {
      await declineQuote({
        quoteRequestSupplierId: entry.id,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }).unwrap()
      toast.success(t('inbox.declineSuccess'))
    } catch {
      toast.error(t('inbox.declineFailed'))
    }
  }

  const description = useMemo(() => {
    if (!counts) return t('inbox.description')
    if (counts.urgent > 0) return t('inbox.urgentSummary', { count: counts.urgent })
    if (counts.pending > 0) return t('inbox.pendingSummary', { count: counts.pending })
    return t('inbox.description')
  }, [counts, t])

  return (
    <PageShell className="space-y-6" data-testid="supplier-quote-inbox-page">
      <PageHeader title={t('inbox.title')} description={description} />

      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {TABS.map(({ key, countKey }) => {
          const count = counts ? (counts[countKey as keyof typeof counts] ?? 0) : null
          return (
            <Button
              key={key}
              role="tab"
              aria-selected={tab === key}
              size="sm"
              variant={tab === key ? 'default' : 'outline'}
              data-testid={`quote-inbox-tab-${key}`}
              onClick={() => {
                setTab(key)
                setPage(1)
              }}
            >
              {t(`inbox.tabs.${key}`)}
              {count !== null && <span className="ml-1.5 opacity-70">{count}</span>}
            </Button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('inbox.searchPlaceholder')}
            aria-label={t('inbox.searchPlaceholder')}
            className="pl-8"
            data-testid="quote-inbox-search"
          />
        </div>
        <div className="flex items-center gap-1">
          {SORTS.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={sort === option ? 'secondary' : 'ghost'}
              aria-pressed={sort === option}
              onClick={() => {
                setSort(option)
                setPage(1)
              }}
            >
              {t(`inbox.sort.${option}`)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
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
          title={search || tab !== 'all' ? t('inbox.noMatchesTitle') : t('inbox.emptyTitle')}
          description={
            search || tab !== 'all' ? t('inbox.noMatchesDescription') : t('inbox.emptyDescription')
          }
          icon={<Inbox className="h-6 w-6" />}
        />
      )}

      {!isLoading && !isError && inbox.length > 0 && (
        <div
          className={`space-y-3 ${isFetching ? 'opacity-60 transition-opacity' : ''}`}
          aria-busy={isFetching}
        >
          {inbox.map((entry) => (
            <InboxCard
              key={entry.id}
              entry={entry}
              onDecline={handleDecline}
              declining={declining}
            />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            {t('inbox.pageOf', { page, pageCount, total })}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('inbox.previous')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount || isFetching}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              {t('inbox.next')}
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  )
}
