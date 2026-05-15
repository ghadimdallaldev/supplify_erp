import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { toast } from 'react-hot-toast'
import {
  useGetPublicRestaurantQuery,
  useLazyGetPublicReservationAvailabilityQuery,
  useCreatePublicReservationMutation,
} from '../services/api'

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function PublicReservationPortal() {
  const { restaurantIdOrSlug } = useParams<{ restaurantIdOrSlug?: string }>()
  const navigate = useNavigate()

  const {
    data: restaurant,
    isLoading: loadingRestaurant,
    isError: restaurantNotFound,
  } = useGetPublicRestaurantQuery(restaurantIdOrSlug ?? '', { skip: !restaurantIdOrSlug })
  const [fetchAvailability, { data: availabilityData, isFetching: loadingAvailability }] =
    useLazyGetPublicReservationAvailabilityQuery()
  const [createReservation, { isLoading: creatingReservation }] =
    useCreatePublicReservationMutation()

  const [form, setForm] = useState({
    partySize: 2,
    date: new Date().toISOString().slice(0, 10),
    selectedSlot: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
  })

  const slots = availabilityData?.slots ?? []
  const selectedSlotDetails = useMemo(
    () => slots.find((slot) => slot.startTime === form.selectedSlot),
    [slots, form.selectedSlot]
  )

  const handleCheckAvailability = async () => {
    if (!restaurant?.id) return
    if (!form.date) {
      toast.error('Please choose a date')
      return
    }

    try {
      await fetchAvailability({
        restaurantId: restaurant.id,
        partySize: form.partySize,
        date: form.date,
      }).unwrap()
      toast.success('Availability refreshed')
    } catch (error: any) {
      toast.error(
        error?.data?.message || error?.data?.error?.message || 'Unable to check availability'
      )
    }
  }

  const handleCreateReservation = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!restaurant?.id || !form.selectedSlot) {
      toast.error('Please select a time slot')
      return
    }

    try {
      const response = await createReservation({
        restaurantId: restaurant.id,
        partySize: form.partySize,
        scheduledAt: form.selectedSlot,
        customerName: form.customerName,
        customerEmail: form.customerEmail || undefined,
        customerPhone: form.customerPhone || undefined,
        notes: form.notes || undefined,
      }).unwrap()

      toast.success('Reservation confirmed!')
      const reservation = response.reservation
      navigate(`/reserve/confirmation?token=${reservation.manageToken}`)
    } catch (error: any) {
      toast.error(
        error?.data?.message || error?.data?.error?.message || 'Unable to create reservation'
      )
    }
  }

  // No restaurant in URL – show “use your restaurant’s link” message
  if (!restaurantIdOrSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Reserve a table</CardTitle>
            <CardDescription>
              Use the reservation link provided by your restaurant. Each restaurant has its own
              unique link.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Loading restaurant
  if (loadingRestaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center text-[var(--text-muted)]">Loading…</CardContent>
        </Card>
      </div>
    )
  }

  // Restaurant not found
  if (restaurantNotFound || !restaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Restaurant not found</CardTitle>
            <CardDescription>
              This reservation link is invalid or the restaurant may have been removed.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const restaurantName = restaurant.name

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row">
        <Card className="w-full lg:w-2/5">
          <CardHeader>
            <CardTitle>Book a table at {restaurantName}</CardTitle>
            <CardDescription>Reserve a table in under a minute. No login required.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Party size</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={form.partySize}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      partySize: Number(event.target.value) || prev.partySize,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, date: event.target.value, selectedSlot: '' }))
                  }
                />
              </div>
            </div>

            <Button
              variant="default"
              onClick={handleCheckAvailability}
              disabled={loadingAvailability}
            >
              {loadingAvailability ? 'Checking…' : 'Check availability'}
            </Button>

            <div className="space-y-2">
              <Label>Available times</Label>
              {slots.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Choose a date, then click “Check availability” to view open time slots.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {slots.map((slot) => (
                    <button
                      type="button"
                      className={`flex flex-col rounded-lg border px-3 py-2 text-left text-xs transition ${
                        slot.startTime === form.selectedSlot
                          ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                          : slot.isAvailable
                            ? 'border-[var(--app-border)] hover:border-[var(--brand)]/50 hover:text-[var(--brand-mid)]'
                            : 'border-[var(--app-border)] text-[var(--text-muted)]'
                      }`}
                      key={slot.startTime}
                      disabled={!slot.isAvailable}
                      onClick={() => setForm((prev) => ({ ...prev, selectedSlot: slot.startTime }))}
                    >
                      <span className="font-medium">{formatTime(slot.startTime)}</span>
                      <span>Up to {slot.capacityAvailable} seats</span>
                      {!slot.isAvailable ? (
                        <span className="text-[10px] uppercase text-[var(--red)]">Waitlist</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="w-full lg:w-3/5">
          <CardHeader>
            <CardTitle>Guest details</CardTitle>
            <CardDescription>
              Fill in your contact information to confirm your reservation at {restaurantName}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateReservation}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.customerName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, customerName: event.target.value }))
                    }
                    required
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.customerEmail}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, customerEmail: event.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.customerPhone}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, customerPhone: event.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label>Selected time</Label>
                  <div className="flex h-10 items-center rounded-md border border-[var(--app-border)] px-3 text-sm">
                    {selectedSlotDetails ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{formatTime(selectedSlotDetails.startTime)}</Badge>
                        <span>{new Date(form.date).toLocaleDateString()}</span>
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)]">Pick a time slot to continue</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Tell us about special occasions, allergies, or seating preferences."
                  className="min-h-[120px]"
                />
              </div>

              <Button
                type="submit"
                disabled={creatingReservation || !form.selectedSlot}
                className="w-full"
              >
                {creatingReservation ? 'Reserving…' : 'Confirm reservation'}
              </Button>

              <p className="text-xs text-[var(--text-muted)]">
                By completing this booking you agree to receive reservation updates for this visit.
                To modify or cancel, use the confirmation link sent after booking.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default PublicReservationPortal
