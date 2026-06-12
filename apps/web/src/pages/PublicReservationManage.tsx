import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { toast } from 'sonner'
import {
  useGetPublicReservationDetailsQuery,
  useGetPublicReservationAvailabilityQuery,
  useReschedulePublicReservationMutation,
  useCancelPublicReservationMutation,
} from '../services/api'
import { PublicPageLayout, PublicPanel } from '../components/public/PublicPageLayout'
import { ReservationTimeSlotGrid } from '../components/public/ReservationTimeSlotGrid'

function formatDateTime(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function extractApiError(error: unknown, fallback: string) {
  const err = error as { data?: { message?: string; error?: { message?: string } } }
  return err?.data?.message || err?.data?.error?.message || fallback
}

export function PublicReservationManage() {
  const params = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = params.token ?? ''
  const waitlistAccepted = searchParams.get('waitlistAccepted') === 'true'

  const { data, isLoading, refetch } = useGetPublicReservationDetailsQuery(token, { skip: !token })
  const reservation = data?.reservation

  const [rescheduleDate, setRescheduleDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [rescheduleSlot, setRescheduleSlot] = useState('')

  useEffect(() => {
    if (reservation?.scheduled_at) {
      setRescheduleDate(new Date(reservation.scheduled_at).toISOString().slice(0, 10))
    }
  }, [reservation?.scheduled_at])

  const partySize = reservation?.party_size ?? 2
  const { data: availability } = useGetPublicReservationAvailabilityQuery(
    {
      restaurantId: reservation?.restaurant_id ?? '',
      partySize,
      date: rescheduleDate,
      manageToken: token,
    },
    { skip: !reservation }
  )

  const [rescheduleReservation, { isLoading: rescheduling }] =
    useReschedulePublicReservationMutation()
  const [cancelReservation, { isLoading: cancelling }] = useCancelPublicReservationMutation()

  const slots = useMemo(() => availability?.slots ?? [], [availability?.slots])

  if (!token) {
    return (
      <PublicPageLayout
        centered
        narrow
        title="Link required"
        subtitle="Open this page from the manage link in your confirmation email."
      />
    )
  }

  if (isLoading) {
    return (
      <PublicPageLayout narrow title="Manage reservation">
        <Skeleton className="h-48 w-full rounded-xl" />
      </PublicPageLayout>
    )
  }

  if (!reservation) {
    return (
      <PublicPageLayout
        centered
        narrow
        title="Reservation not found"
        subtitle="This management link may have expired or already been used."
      >
        <Button
          variant="outline"
          className="consumer-pressable w-full"
          onClick={() => navigate('/reserve')}
        >
          Return to booking
        </Button>
      </PublicPageLayout>
    )
  }

  const handleReschedule = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!rescheduleSlot) {
      toast.error('Pick a new time before rescheduling')
      return
    }
    try {
      await rescheduleReservation({ token, scheduledAt: rescheduleSlot }).unwrap()
      toast.success('Reservation rescheduled')
      setRescheduleSlot('')
      refetch()
    } catch (error: unknown) {
      toast.error(
        extractApiError(error, 'Unable to reschedule — try another time or contact the restaurant')
      )
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Cancel this reservation? This cannot be undone.')) return
    try {
      await cancelReservation({ token }).unwrap()
      toast.success('Reservation cancelled')
      refetch()
    } catch (error: unknown) {
      toast.error(extractApiError(error, 'Unable to cancel reservation'))
    }
  }

  return (
    <PublicPageLayout
      title="Manage reservation"
      subtitle="Your private link is valid for six months."
      className="pb-12"
    >
      {waitlistAccepted && (
        <div className="mx-auto mb-5 max-w-3xl rounded-xl border border-[var(--mint-light)]/40 bg-[var(--mint-pale)] px-4 py-3 text-sm text-[var(--mint)]">
          Your waitlist offer was accepted and your reservation is confirmed.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        <PublicPanel title="Current booking" className="lg:w-[42%] lg:shrink-0">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[var(--text-muted)]">Status</dt>
              <dd className="mt-1">
                <Badge variant="outline" className="capitalize">
                  {reservation.status.toLowerCase()}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">When</dt>
              <dd className="mt-1 font-semibold text-[var(--text)]">
                {formatDateTime(reservation.scheduled_at)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Guests</dt>
              <dd className="mt-1 font-semibold text-[var(--text)]">{reservation.party_size}</dd>
            </div>
            <div>
              <Label htmlFor="resNotes">Special notes</Label>
              <Textarea
                id="resNotes"
                readOnly
                value={reservation.notes ?? ''}
                placeholder="None"
                className="mt-1.5 resize-none bg-[var(--brand-ultra)]"
              />
            </div>
          </dl>

          <div className="mt-5 flex flex-col gap-2">
            <Button
              variant="destructive"
              className="consumer-pressable w-full"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling ? 'Cancelling…' : 'Cancel reservation'}
            </Button>
            <Button
              variant="outline"
              className="consumer-pressable w-full"
              onClick={() => navigate('/reserve')}
            >
              Book another table
            </Button>
          </div>
        </PublicPanel>

        <PublicPanel
          title="Reschedule"
          description="Pick a new date and time. Your current booking is excluded from capacity counts."
          className="lg:min-w-0 lg:flex-1"
        >
          <form className="space-y-4" onSubmit={handleReschedule}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rescheduleDate">Date</Label>
                <Input
                  id="rescheduleDate"
                  type="date"
                  className="mt-1.5"
                  value={rescheduleDate}
                  onChange={(event) => {
                    setRescheduleDate(event.target.value)
                    setRescheduleSlot('')
                  }}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <Label htmlFor="guestCount">Guests</Label>
                <Input id="guestCount" className="mt-1.5" value={reservation.party_size} disabled />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Available times</Label>
              {slots.length === 0 ? (
                <p className="rounded-lg bg-[var(--brand-ultra)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
                  No availability for this date. Try another day or contact the restaurant.
                </p>
              ) : (
                <ReservationTimeSlotGrid
                  slots={slots}
                  selectedSlot={rescheduleSlot}
                  onSelect={setRescheduleSlot}
                  showCapacity
                />
              )}
            </div>

            <Button
              type="submit"
              className="consumer-pressable w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
              disabled={rescheduling || !rescheduleSlot}
            >
              {rescheduling ? 'Updating…' : 'Confirm new time'}
            </Button>
          </form>
        </PublicPanel>
      </div>
    </PublicPageLayout>
  )
}

export default PublicReservationManage
