import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGetQuoteRequestsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { pageHeaderRowClass } from '../components/ui/card-layout'
import { FileQuestion, Plus } from 'lucide-react'

function statusLabel(status: string) {
  switch (status) {
    case 'open':
      return 'Open'
    case 'closed':
      return 'Closed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

export function QuoteRequestsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useGetQuoteRequestsQuery({ page: 1, limit: 50 })
  const requests = data?.quoteRequests ?? []

  return (
    <div className="space-y-6">
      <div className={pageHeaderRowClass}>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Quote requests</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Request best price from multiple suppliers and compare responses.
          </p>
        </div>
        <Button onClick={() => navigate('/app/quote-requests/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Request best price
        </Button>
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
          title="Could not load quote requests"
          description="Please try again."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {!isLoading && !isError && requests.length === 0 && (
        <EmptyState
          title="No quote requests yet"
          description="Select products and suppliers to ask for best price and availability."
          icon={<FileQuestion className="h-6 w-6" />}
          action={
            <Button onClick={() => navigate('/app/quote-requests/new')}>Request best price</Button>
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
                    Quote request · {new Date(req.createdAt).toLocaleDateString()}
                  </CardTitle>
                  <Badge variant={req.status === 'open' ? 'default' : 'secondary'}>
                    {statusLabel(req.status)}
                  </Badge>
                </div>
                <CardDescription>
                  {req.itemCount ?? 0} item{(req.itemCount ?? 0) === 1 ? '' : 's'} ·{' '}
                  {req.supplierCount ?? 0} supplier{(req.supplierCount ?? 0) === 1 ? '' : 's'} ·{' '}
                  {req.responseCount ?? 0} response{(req.responseCount ?? 0) === 1 ? '' : 's'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 justify-between items-center">
                {req.note && (
                  <p className="text-sm text-[var(--text-muted)] line-clamp-1 flex-1">{req.note}</p>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to={`/app/quote-requests/${req.id}`}>Compare offers</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
