import { Link } from 'react-router-dom'
import { useGetSupplierQuoteInboxQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { pageHeaderRowClass } from '../components/ui/card-layout'
import { Inbox } from 'lucide-react'

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'responded':
      return 'Responded'
    case 'declined':
      return 'Declined'
    default:
      return status
  }
}

export function SupplierQuoteInboxPage() {
  const { data, isLoading, isError, refetch } = useGetSupplierQuoteInboxQuery({
    page: 1,
    limit: 50,
  })
  const inbox = data?.inbox ?? []

  return (
    <div className="space-y-6">
      <div className={pageHeaderRowClass}>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Quote request inbox</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Restaurants requesting your best price and availability.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          title="Could not load inbox"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {!isLoading && !isError && inbox.length === 0 && (
        <EmptyState
          title="Inbox is empty"
          description="When restaurants send quote requests, they will appear here."
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
                    {statusLabel(entry.status)}
                  </Badge>
                </div>
                <CardDescription>
                  {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'} ·{' '}
                  {new Date(entry.createdAt).toLocaleDateString()}
                  {entry.neededBy ? ` · Needed by ${entry.neededBy}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end">
                <Button asChild size="sm">
                  <Link to={`/app/quote-requests/supplier/${entry.id}`}>
                    {entry.status === 'responded' ? 'View response' : 'Respond'}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
