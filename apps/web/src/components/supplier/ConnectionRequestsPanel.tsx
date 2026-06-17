import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  useGetRestaurantConnectionRequestsQuery,
  useAcceptConnectionRequestMutation,
  useDeclineConnectionRequestMutation,
} from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { UserPlus, X } from 'lucide-react'

export function ConnectionRequestsPanel() {
  const { data, isLoading, isError, refetch } = useGetRestaurantConnectionRequestsQuery()
  const [acceptRequest, { isLoading: accepting }] = useAcceptConnectionRequestMutation()
  const [declineRequest, { isLoading: declining }] = useDeclineConnectionRequestMutation()

  const requests = data?.requests ?? []

  if (isLoading) {
    return (
      <Skeleton className="h-24 w-full rounded-xl mb-4" data-testid="connection-requests-loading" />
    )
  }

  if (isError) {
    return (
      <div
        className="rounded-xl border border-[var(--app-border)] p-4 mb-4 text-center text-sm"
        data-testid="connection-requests-error"
      >
        <p className="text-[var(--text-muted)]">Could not load connection requests.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  if (requests.length === 0) {
    return null
  }

  const handleAccept = async (id: string) => {
    try {
      await acceptRequest(id).unwrap()
      toast.success('Connection accepted — supplier added to your network')
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to accept request')
    }
  }

  const handleDecline = async (id: string) => {
    try {
      await declineRequest(id).unwrap()
      toast.success('Connection request declined')
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to decline request')
    }
  }

  return (
    <Card className="mb-6 border-[var(--brand-mid)]" data-testid="connection-requests-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-[var(--brand)]" />
          Supplier connection requests
        </CardTitle>
        <CardDescription>
          Suppliers want to connect so you can browse their catalog and place orders.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map(
          (req: {
            id: string
            supplier_id: string
            supplier_name: string
            expires_at: string
            created_at: string
          }) => (
            <div
              key={req.id}
              className="flex flex-col gap-3 rounded-lg border border-[var(--app-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`connection-request-${req.id}`}
            >
              <div className="min-w-0">
                <Link
                  to={`/app/suppliers/${req.supplier_id}`}
                  className="font-medium text-[var(--text)] hover:text-[var(--brand)]"
                >
                  {req.supplier_name}
                </Link>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Expires {new Date(req.expires_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  onClick={() => handleAccept(req.id)}
                  disabled={accepting || declining}
                  data-testid={`accept-connection-${req.id}`}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDecline(req.id)}
                  disabled={accepting || declining}
                  data-testid={`decline-connection-${req.id}`}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Decline
                </Button>
              </div>
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}
