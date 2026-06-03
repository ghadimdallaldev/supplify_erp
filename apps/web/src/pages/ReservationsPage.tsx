import { useMemo, useState } from 'react'
import { getApiErrorMessage } from '../lib/apiError'
import {
  useGetReservationBoardQuery,
  useGetReservationAnalyticsQuery,
  useGetGuestIntelligenceQuery,
  useGetReservationWaitlistQuery,
  useManuallyPromoteWaitlistMutation,
} from '../services/reservationsApi'
import {
  useGetBranchesQuery,
  useGetEntitlementsQuery,
  useGetRestaurantMeQuery,
} from '../services/api'
import { featureEnabled } from '../lib/planLimits'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ReservationBoard } from '../components/reservations/ReservationBoard'
import { ReservationTableBuilder } from '../components/reservations/ReservationTableBuilder'
import { PublicBookingSettingsCard } from '../components/reservations/PublicBookingSettingsCard'
import { ReservationAnalyticsPanel } from '../components/reservations/ReservationAnalyticsPanel'
import { ReservationCreateDrawer } from '../components/reservations/ReservationCreateDrawer'
import { ReservationAssignmentsSummary } from '../components/reservations/ReservationAssignmentsSummary'
import { CalendarDays, Loader2, Link2, Copy, Star, Users, Sparkles } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { toast } from 'react-hot-toast'
import { copyToClipboard } from '../utils/clipboard'
import { RequirePermission } from '../components/RequirePermission'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'

export function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')
  const [branchId, setBranchId] = useState('')

  const boardQueryArgs = useMemo(
    () => ({
      date: selectedDate,
      ...(branchId ? { branchId } : {}),
    }),
    [selectedDate, branchId]
  )

  const {
    data: boardData,
    isLoading: boardLoading,
    isError: boardError,
    error: boardQueryError,
    refetch,
  } = useGetReservationBoardQuery(boardQueryArgs, {
    pollingInterval: 30_000,
    skipPollingIfUnfocused: true,
    refetchOnFocus: false,
    refetchOnReconnect: true,
  })
  const { data: analytics, refetch: refetchAnalytics } = useGetReservationAnalyticsQuery({
    range,
    ...(branchId ? { branchId } : {}),
  })
  const { data: guestIntel, isLoading: guestIntelLoading } = useGetGuestIntelligenceQuery({
    ...(branchId ? { branchId } : {}),
  })
  const {
    data: waitlistData,
    isLoading: waitlistLoading,
    refetch: refetchWaitlist,
  } = useGetReservationWaitlistQuery(branchId ? { branchId } : undefined)
  const { data: branchesData } = useGetBranchesQuery()
  const branches = branchesData?.branches ?? branchesData?.accounts ?? []
  const [promoteWaitlist, { isLoading: promoting }] = useManuallyPromoteWaitlistMutation()
  const { data: restaurantMe } = useGetRestaurantMeQuery()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const waitlistAutoPromoEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.waitlist_auto_promo
  )

  const bookingLink = useMemo(() => {
    const restaurant = restaurantMe?.restaurant
    if (!restaurant?.id) return null
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const segment = restaurant.slug || restaurant.id
    const branchQuery = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
    return `${base}/reserve/${segment}${branchQuery}`
  }, [restaurantMe?.restaurant, branchId])

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
    <RequirePermission permission="RESERVATIONS_VIEW" title="reservations">
      <div className="page-stack overflow-x-hidden">
        <PageHeader
          title="Reservations cockpit"
          description="Track bookings, optimise capacity, and wow every guest from one unified view."
          actions={
            <div className="action-bar w-full sm:w-auto">
              <div className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 shadow-sm sm:w-auto">
                <CalendarDays className="h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="min-w-0 flex-1 border-none p-0 text-sm focus-visible:ring-0"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                >
                  Today
                </Button>
              </div>
              {branches.length > 1 ? (
                <select
                  className="h-10 min-w-[140px] rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 text-sm shadow-sm"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                  aria-label="Branch"
                >
                  <option value="">All branches</option>
                  {branches.map((branch: { id: string; name: string }) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <ReservationCreateDrawer
                tables={tables}
                onCreated={() => {
                  refetch()
                  refetchAnalytics()
                }}
              />
            </div>
          }
        />

        {bookingLink ? (
          <Card className="border border-[var(--app-border)] bg-[var(--surface)]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4 text-[var(--brand-mid)]" />
                Booking link for guests
              </CardTitle>
              <CardDescription>
                Share this link so clients can book a table online. They’ll see availability and get
                a confirmation by email or WhatsApp when contact details are provided.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div
                className="min-w-0 flex-1 break-all rounded-md border border-[var(--app-border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text-mid)] sm:text-sm"
                title={bookingLink}
              >
                {bookingLink}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyBookingLink}
                className="min-h-[44px] w-full shrink-0 sm:w-auto"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {boardError ? (
          <Card className="border border-red-200 bg-red-50">
            <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-red-900">
                {getApiErrorMessage(boardQueryError, 'Could not load the reservation board.')}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
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

        <Card>
          <CardHeader>
            <CardTitle>Waitlist queue</CardTitle>
            <CardDescription>
              Offer status and manual promotion for guests waiting for a table
            </CardDescription>
            {!waitlistAutoPromoEnabled ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                Automatic waitlist offers when a table frees up are not on your plan. You can still
                promote guests manually. Upgrade to enable auto-promotion.
              </p>
            ) : (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-2">
                Auto-promotion is on: when a reservation is cancelled, the next waitlisted guest may
                receive a timed table offer.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {waitlistLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading waitlist…
              </div>
            ) : (waitlistData?.waitlist || []).length === 0 ? (
              <EmptyState
                title="Waitlist is empty"
                description="Guests waiting for a table will appear here."
                icon={<Users className="h-6 w-6" aria-hidden />}
              />
            ) : (
              <div className="space-y-2">
                {(waitlistData?.waitlist || []).map((entry: Record<string, unknown>) => (
                  <div
                    key={String(entry.id)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{String(entry.customer_name)}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {String(entry.party_size)} guests · #{String(entry.position ?? '—')} in
                        queue
                      </p>
                      {entry.offer_status && String(entry.offer_status) !== 'none' ? (
                        <Badge variant="outline" className="mt-1 capitalize">
                          Offer: {String(entry.offer_status)}
                          {entry.offer_expires_at
                            ? ` · expires ${new Date(String(entry.offer_expires_at)).toLocaleString()}`
                            : ''}
                        </Badge>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[40px] w-full sm:w-auto"
                      disabled={promoting || entry.offer_status === 'offered'}
                      onClick={async () => {
                        try {
                          await promoteWaitlist(String(entry.id)).unwrap()
                          toast.success('Offer sent to guest')
                          refetchWaitlist()
                          refetch()
                        } catch {
                          toast.error('Could not promote guest')
                        }
                      }}
                    >
                      Promote
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {!boardLoading ? (
          <ReservationAssignmentsSummary
            reservations={reservations}
            tables={tables}
            boardDate={selectedDate}
          />
        ) : null}

        {boardLoading ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-[var(--app-border)] p-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : boardError ? null : (
          <ReservationBoard
            reservations={reservations}
            tables={tables}
            waitlist={waitlist}
            boardDate={selectedDate}
            branchId={branchId || undefined}
          />
        )}

        <div className="space-y-6">
          <PublicBookingSettingsCard />

          <div className="overflow-x-hidden">
            <ReservationTableBuilder tables={tables} reservations={reservations} defaultLiveView />
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
                            <p className="font-medium text-[var(--text)]">
                              {String(guest.customer_name)}
                            </p>
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
    </RequirePermission>
  )
}
