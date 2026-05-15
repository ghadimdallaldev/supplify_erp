import { useMemo, useState } from 'react'
import {
  useGetReservationBoardQuery,
  useGetReservationAnalyticsQuery,
  useGetGuestIntelligenceQuery,
} from '../services/reservationsApi'
import { useGetRestaurantMeQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ReservationBoard } from '../components/reservations/ReservationBoard'
import { ReservationTableBuilder } from '../components/reservations/ReservationTableBuilder'
import { ReservationAnalyticsPanel } from '../components/reservations/ReservationAnalyticsPanel'
import { ReservationCreateDrawer } from '../components/reservations/ReservationCreateDrawer'
import { CalendarDays, Loader2, Link2, Copy, Star, Users, Sparkles } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { toast } from 'react-hot-toast'
import { copyToClipboard } from '../utils/clipboard'

export function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')

  const {
    data: boardData,
    isLoading: boardLoading,
    refetch,
  } = useGetReservationBoardQuery({ date: selectedDate })
  const { data: analytics, refetch: refetchAnalytics } = useGetReservationAnalyticsQuery({ range })
  const { data: guestIntel, isLoading: guestIntelLoading } = useGetGuestIntelligenceQuery({})
  const { data: restaurantMe } = useGetRestaurantMeQuery()

  const bookingLink = useMemo(() => {
    const restaurant = restaurantMe?.restaurant
    if (!restaurant?.id) return null
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const segment = restaurant.slug || restaurant.id
    const branchQuery = ''
    return `${base}/reserve/${segment}${branchQuery}`
  }, [restaurantMe?.restaurant])

  const tables = boardData?.tables ?? []
  const reservations = boardData?.reservations ?? []
  const waitlist = boardData?.waitlist ?? []

  const summary = useMemo(() => {
    const coversToday = reservations.reduce(
      (sum, reservation) =>
        reservation.status !== 'CANCELLED' ? sum + reservation.party_size : sum,
      0
    )
    const confirmed = reservations.filter(
      (reservation) => reservation.status === 'CONFIRMED'
    ).length
    const waitlisted = reservations.filter(
      (reservation) => reservation.status === 'WAITLIST'
    ).length
    const seated = reservations.filter((reservation) => reservation.status === 'SEATED').length

    return {
      coversToday,
      confirmed,
      waitlisted,
      seated,
    }
  }, [reservations])

  const handleRangeChange = (value: 'day' | 'week' | 'month') => {
    setRange(value)
    refetchAnalytics()
  }

  const handleCopyBookingLink = async () => {
    if (!bookingLink) return
    const copied = await copyToClipboard(bookingLink)
    if (copied) {
      toast.success('Booking link copied to clipboard')
    } else {
      toast.error('Could not copy link — try selecting and copying manually')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Reservations cockpit</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Track bookings, optimise capacity, and wow every guest from one unified view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 shadow-sm">
            <CalendarDays className="mr-2 h-4 w-4 text-[var(--brand-mid)]" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="border-none p-0 text-sm focus-visible:ring-0"
            />
          </div>
          <ReservationCreateDrawer
            tables={tables}
            onCreated={() => {
              refetch()
              refetchAnalytics()
            }}
          />
        </div>
      </div>

      {bookingLink ? (
        <Card className="border border-[var(--app-border)] bg-[var(--surface)]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-[var(--brand-mid)]" />
              Booking link for guests
            </CardTitle>
            <CardDescription>
              Share this link so clients can book a table online. They’ll see availability and get a
              confirmation by email or WhatsApp when contact details are provided.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div
              className="min-w-0 flex-1 rounded-md border border-[var(--app-border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm text-[var(--text-mid)] truncate"
              title={bookingLink}
            >
              {bookingLink}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyBookingLink}
              className="shrink-0"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-[var(--brand-mid)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
              Covers today
            </CardTitle>
            <CardDescription className="text-2xl font-semibold text-[var(--text)]">
              {summary.coversToday}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-[var(--mint)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
              Confirmed
            </CardTitle>
            <CardDescription className="text-2xl font-semibold text-[var(--text)]">
              {summary.confirmed}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-[var(--amber)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
              Waitlist
            </CardTitle>
            <CardDescription className="text-2xl font-semibold text-[var(--text)]">
              {summary.waitlisted}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-l-4 border-l-[var(--brand)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
              Currently seated
            </CardTitle>
            <CardDescription className="text-2xl font-semibold text-[var(--text)]">
              {summary.seated}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {boardLoading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-[var(--app-border)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-[var(--brand-mid)]" />
          <p className="text-sm text-[var(--text-muted)]">Loading reservations…</p>
        </div>
      ) : (
        <ReservationBoard reservations={reservations} tables={tables} waitlist={waitlist} />
      )}

      <div className="space-y-6">
        <div className="-mx-4 lg:-mx-6">
          <ReservationTableBuilder tables={tables} />
        </div>

        <ReservationAnalyticsPanel
          analytics={analytics}
          activeRange={range}
          onRangeChange={handleRangeChange}
        />

        <Card>
          <CardHeader>
            <CardTitle>Guest intelligence</CardTitle>
            <CardDescription>
              Repeat guests, loyalty moments, and smart follow-ups for your location.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-[var(--text-muted)]">
            {guestIntelLoading ? (
              <div className="flex items-center gap-2 text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading guest insights…
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--brand-ultra)] p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      <Users className="h-4 w-4" />
                      Recent guests
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                      {guestIntel?.recentGuests?.length ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--brand-ultra)] p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      <Sparkles className="h-4 w-4" />
                      Repeat guests
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                      {guestIntel?.repeatGuests?.length ?? 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--amber-mid)]/35 bg-[var(--amber-pale)] p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--amber)]">
                      <Star className="h-4 w-4" />
                      VIP guests
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                      {guestIntel?.vipGuests?.length ?? 0}
                    </p>
                  </div>
                </div>

                {(guestIntel?.followUps?.length ?? 0) > 0 ? (
                  <div className="space-y-2">
                    <p className="font-medium text-[var(--text)]">Suggested follow-ups</p>
                    {guestIntel?.followUps?.map((guest, index) => (
                      <div
                        key={`${guest.customer_name}-${index}`}
                        className="flex flex-col gap-1 rounded-xl border border-[var(--app-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium text-[var(--text)]">{String(guest.customer_name)}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {Number(guest.visit_count)} visits · last{' '}
                            {guest.last_visit
                              ? new Date(String(guest.last_visit)).toLocaleDateString()
                              : '—'}
                          </p>
                        </div>
                        <Badge variant="secondary" className="w-fit">
                          {String(guest.suggestion)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--text-muted)]">
                    Book more reservations to unlock repeat-guest and VIP insights.
                  </p>
                )}

                <div className="rounded-2xl border border-dashed border-[var(--mint)]/35 bg-[var(--mint-pale)] p-4 text-xs text-[var(--mint)]">
                  Email and WhatsApp confirmations are sent automatically for confirmed seats when
                  guests provide contact details. Configure your channels in Settings →
                  Notifications.
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
