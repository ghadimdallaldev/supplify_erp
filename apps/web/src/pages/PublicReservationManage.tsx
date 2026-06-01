import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { toast } from 'react-hot-toast'
import {
  useGetPublicReservationDetailsQuery,
  useGetPublicReservationAvailabilityQuery,
  useReschedulePublicReservationMutation,
  useCancelPublicReservationMutation,
} from '../services/api'

function formatDateTime(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
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
      <div className="flex min-h-screen items-center justify-center bg-slate-900/90 text-white">
        <p className="text-sm text-[var(--text-muted)]">Missing reservation token.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/90 text-white">
        <p className="text-sm text-[var(--text-muted)]">Loading reservation details…</p>
      </div>
    )
  }

  if (!reservation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/90 text-white">
        <Card className="w-full max-w-md border-white/10 bg-white/95 text-[var(--text-muted)] shadow-xl">
          <CardHeader>
            <CardTitle>Reservation not found</CardTitle>
            <CardDescription>
              The management link may have expired or already been used.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/reserve')}>
              Return to booking
            </Button>
          </CardContent>
        </Card>
      </div>
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

  function extractApiError(error: unknown, fallback: string) {
    const err = error as { data?: { message?: string; error?: { message?: string } } }
    return err?.data?.message || err?.data?.error?.message || fallback
  }

  const handleCancel = async () => {
    if (!window.confirm('Cancel this reservation? This cannot be undone.')) return
    try {
      await cancelReservation({ token }).unwrap()
      toast.success('Reservation cancelled')
      refetch()
    } catch (error: any) {
      toast.error(
        error?.data?.message || error?.data?.error?.message || 'Unable to cancel reservation'
      )
    }
  }

  return (
    <div className="min-h-screen bg-slate-900/90 py-12 px-4 text-white">
      {waitlistAccepted && (
        <div className="mx-auto max-w-5xl mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          Your waitlist offer was accepted and your reservation is confirmed.
        </div>
      )}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row">
        <Card className="w-full bg-white/95 text-[var(--text-muted)] shadow-xl lg:w-2/5">
          <CardHeader>
            <CardTitle>Reservation details</CardTitle>
            <CardDescription>Your management link is valid for six months.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-[var(--text-muted)]">
            <div>
              <Label>Status</Label>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {reservation.status.toLowerCase()}
                </Badge>
              </div>
            </div>
            <div>
              <Label>When</Label>
              <p className="mt-1 font-semibold text-[var(--text)]">
                {formatDateTime(reservation.scheduled_at)}
              </p>
            </div>
            <div>
              <Label>Guests</Label>
              <p className="mt-1 font-semibold text-[var(--text)]">{reservation.party_size}</p>
            </div>
            <div>
              <Label>Special notes</Label>
              <Textarea
                readOnly
                value={reservation.notes ?? ''}
                placeholder="None"
                className="resize-none bg-[var(--surface-muted)]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="destructive" disabled={cancelling} onClick={handleCancel}>
                {cancelling ? 'Cancelling…' : 'Cancel reservation'}
              </Button>
              <Button variant="outline" onClick={() => navigate('/reserve')}>
                Book another table
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="w-full bg-white/95 text-[var(--text-muted)] shadow-xl lg:w-3/5">
          <CardHeader>
            <CardTitle>Reschedule reservation</CardTitle>
            <CardDescription>
              Pick a new date and time. Your current booking is excluded from capacity so you can
              move to another slot on the same day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleReschedule}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={rescheduleDate}
                    onChange={(event) => {
                      setRescheduleDate(event.target.value)
                      setRescheduleSlot('')
                    }}
                    min={new Date().toISOString().slice(0, 10)}
                  />
                </div>
                <div>
                  <Label>Guests</Label>
                  <Input value={reservation.party_size} disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Available times</Label>
                {slots.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No availability for the selected date. Try a different day or contact the
                    restaurant.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {slots.map((slot) => (
                      <button
                        type="button"
                        key={slot.startTime}
                        className={`flex flex-col rounded-lg border px-3 py-2 text-left text-xs transition ${
                          rescheduleSlot === slot.startTime
                            ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                            : slot.isAvailable
                              ? 'border-[var(--app-border)] hover:border-[var(--brand)]/50 hover:text-[var(--brand-mid)]'
                              : 'border-[var(--app-border)] text-[var(--text-muted)]'
                        }`}
                        disabled={!slot.isAvailable}
                        onClick={() => setRescheduleSlot(slot.startTime)}
                      >
                        <span className="font-semibold">
                          {new Date(slot.startTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>Up to {slot.capacityAvailable} seats</span>
                        {!slot.isAvailable ? (
                          <span className="text-[10px] uppercase text-[var(--red)]">
                            Unavailable
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={rescheduling || !rescheduleSlot}>
                {rescheduling ? 'Updating…' : 'Confirm new time'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default PublicReservationManage
