import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { useGetPublicReservationDetailsQuery } from '../services/api'
import { Loader2 } from 'lucide-react'

function formatWhen(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }
}

export function PublicReservationConfirmation() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const { data, isLoading, isError } = useGetPublicReservationDetailsQuery(token, {
    skip: !token,
  })
  const reservation = data?.reservation
  const manageHref = token ? `/reserve/manage/${token}` : null
  const scheduledAt =
    reservation?.scheduled_at ?? (reservation as { scheduledAt?: string })?.scheduledAt
  const when = scheduledAt ? formatWhen(scheduledAt) : null
  const partySize = reservation?.party_size
  const customerName = reservation?.customer_name
  const restaurantName = (reservation as { restaurantName?: string })?.restaurantName
  const restaurantSlug = (reservation as { restaurantSlug?: string })?.restaurantSlug

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-16">
      <Card className="w-full max-w-xl border-white/10 bg-white/95 text-[var(--text)] shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-semibold tracking-tight">
            Reservation confirmed
          </CardTitle>
          <CardDescription>
            {restaurantName
              ? `Your table at ${restaurantName} is booked.`
              : 'Thanks for booking with Supplify.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex justify-center py-8 text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : isError || !reservation ? (
            <p className="text-center text-sm text-[var(--text-muted)]">
              {token
                ? 'We could not load your reservation details. Use the link from your confirmation email or contact the restaurant.'
                : 'Your reservation is confirmed. Check your email for the manage link.'}
            </p>
          ) : (
            <div className="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)]/50 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">Status</span>
                <Badge variant="outline" className="capitalize">
                  {reservation.status?.toLowerCase()}
                </Badge>
              </div>
              {when ? (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--text-muted)]">Date</span>
                    <span className="text-right font-medium">{when.date}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--text-muted)]">Time</span>
                    <span className="font-medium">{when.time}</span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">Party size</span>
                <span className="font-medium">{partySize} guests</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">Name</span>
                <span className="font-medium">{customerName}</span>
              </div>
            </div>
          )}

          {manageHref ? (
            <div className="space-y-3 text-center">
              <Link to={manageHref} className="block">
                <Button className="w-full">Manage or cancel reservation</Button>
              </Link>
              <p className="text-xs text-[var(--text-muted)]">
                Reschedule or cancel your visit using your private manage link.
              </p>
            </div>
          ) : null}

          {restaurantSlug ? (
            <div className="text-center">
              <Link to={`/reserve/${restaurantSlug}`}>
                <Button variant="outline">Book another table</Button>
              </Link>
            </div>
          ) : (
            <div className="text-center">
              <Link to="/reserve">
                <Button variant="outline">Book another table</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default PublicReservationConfirmation
