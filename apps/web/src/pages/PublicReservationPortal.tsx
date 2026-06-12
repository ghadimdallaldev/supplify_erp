import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { toast } from 'sonner'
import {
  useGetPublicRestaurantQuery,
  useLazyGetPublicReservationAvailabilityQuery,
  useCreatePublicReservationMutation,
  useJoinPublicWaitlistMutation,
} from '../services/api'
import { PublicPageLayout, PublicPanel } from '../components/public/PublicPageLayout'
import { ReservationTimeSlotGrid, formatTime } from '../components/public/ReservationTimeSlotGrid'
import { cn } from '../lib/utils'
import { CalendarDays, Clock3, Sparkles, Users } from 'lucide-react'

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
  const [joinWaitlist, { isLoading: joiningWaitlist }] = useJoinPublicWaitlistMutation()
  const [showWaitlistForm, setShowWaitlistForm] = useState(false)

  const [form, setForm] = useState({
    partySize: 2,
    date: new Date().toISOString().slice(0, 10),
    selectedSlot: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
  })
  const [availabilityChecked, setAvailabilityChecked] = useState(false)

  const slots = availabilityData?.slots ?? []
  const totalCapacity = availabilityData?.totalCapacity
  const bookingWindow = availabilityData?.bookingWindow
  const hasBookableSlot = slots.some((slot) => slot.isAvailable)
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
      const result = await fetchAvailability({
        restaurantId: restaurant.id,
        partySize: form.partySize,
        date: form.date,
      }).unwrap()
      setAvailabilityChecked(true)
      if (result.totalCapacity != null && form.partySize > result.totalCapacity) {
        toast.error(
          `Maximum capacity is ${result.totalCapacity} guests. Join the waitlist or reduce party size.`
        )
        setShowWaitlistForm(true)
        return
      }
      setShowWaitlistForm(false)
      toast.success('Availability updated')
    } catch (error: unknown) {
      setAvailabilityChecked(false)
      const err = error as { data?: { message?: string; error?: { message?: string } } }
      toast.error(err?.data?.message || err?.data?.error?.message || 'Unable to check availability')
    }
  }

  const guestContactComplete =
    form.customerName.trim().length > 0 &&
    form.customerEmail.trim().length > 0 &&
    form.customerPhone.trim().length > 0
  const canConfirm = Boolean(form.selectedSlot && guestContactComplete)

  const handleCreateReservation = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!restaurant?.id || !form.selectedSlot) {
      toast.error('Please select a time slot')
      return
    }
    if (!form.customerEmail.trim()) {
      toast.error('Email is required')
      return
    }
    if (!form.customerPhone.trim()) {
      toast.error('Phone is required')
      return
    }

    try {
      const response = await createReservation({
        restaurantId: restaurant.id,
        partySize: form.partySize,
        scheduledAt: form.selectedSlot,
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        customerPhone: form.customerPhone.trim(),
        notes: form.notes || undefined,
      }).unwrap()

      toast.success('Reservation confirmed!')
      const reservation = response.reservation
      navigate(`/reserve/confirmation?token=${reservation.manageToken}`)
    } catch (error: unknown) {
      const err = error as { data?: { message?: string; error?: { message?: string } } }
      const message =
        err?.data?.error?.message || err?.data?.message || 'Unable to create reservation'
      toast.error(message)
      if (
        message.toLowerCase().includes('just booked') ||
        message.toLowerCase().includes('unavailable')
      ) {
        setForm((prev) => ({ ...prev, selectedSlot: '' }))
        void handleCheckAvailability()
      }
    }
  }

  const handleJoinWaitlist = async () => {
    if (!restaurant?.id || !form.customerName.trim()) {
      toast.error('Enter your name to join the waitlist')
      return
    }
    try {
      await joinWaitlist({
        restaurantId: restaurant.id,
        partySize: form.partySize,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim() || 'n/a',
        desiredAt: form.selectedSlot || undefined,
        notes: form.notes || undefined,
      }).unwrap()
      toast.success('You are on the waitlist. We will contact you when a table opens.')
      setShowWaitlistForm(false)
    } catch (error: unknown) {
      const err = error as { data?: { message?: string; error?: { message?: string } } }
      toast.error(err?.data?.error?.message || err?.data?.message || 'Could not join waitlist')
    }
  }

  if (!restaurantIdOrSlug) {
    return (
      <PublicPageLayout
        centered
        narrow
        title="Reserve a table"
        subtitle="Use the reservation link provided by your restaurant. Each venue has its own booking page."
      />
    )
  }

  if (loadingRestaurant) {
    return (
      <PublicPageLayout narrow={false}>
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </PublicPageLayout>
    )
  }

  if (restaurantNotFound || !restaurant) {
    return (
      <PublicPageLayout
        centered
        narrow
        title="Restaurant not found"
        subtitle="This reservation link is invalid or the restaurant may have been removed."
      />
    )
  }

  const restaurantName = restaurant.name

  return (
    <PublicPageLayout
      title={`Book at ${restaurantName}`}
      subtitle="Choose your date and party size, pick a time, then confirm in under a minute."
      logoInitial={restaurantName.charAt(0).toUpperCase()}
      className="pb-12"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        <PublicPanel
          title="When are you coming?"
          description="Set your party size and date, then check which times are open."
          className="lg:sticky lg:top-6 lg:w-[42%] lg:shrink-0"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label
                  htmlFor="partySize"
                  className="flex items-center gap-1.5 text-[var(--text-mid)]"
                >
                  <Users className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
                  Party size
                </Label>
                <Input
                  id="partySize"
                  type="number"
                  min={1}
                  max={50}
                  className="mt-1.5 h-11"
                  value={form.partySize}
                  onChange={(event) => {
                    setAvailabilityChecked(false)
                    setForm((prev) => ({
                      ...prev,
                      partySize: Number(event.target.value) || prev.partySize,
                      selectedSlot: '',
                    }))
                  }}
                />
              </div>
              <div>
                <Label
                  htmlFor="resDate"
                  className="flex items-center gap-1.5 text-[var(--text-mid)]"
                >
                  <CalendarDays className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
                  Date
                </Label>
                <Input
                  id="resDate"
                  type="date"
                  className="mt-1.5 h-11"
                  value={form.date}
                  onChange={(event) => {
                    setAvailabilityChecked(false)
                    setForm((prev) => ({ ...prev, date: event.target.value, selectedSlot: '' }))
                  }}
                />
              </div>
            </div>

            <Button
              variant="default"
              onClick={handleCheckAvailability}
              disabled={loadingAvailability}
              className="consumer-pressable w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
            >
              {loadingAvailability ? 'Checking…' : 'Check availability'}
            </Button>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-[var(--text-mid)]">
                <Clock3 className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
                Available times
              </Label>
              {bookingWindow?.openTime && bookingWindow?.closeTime && !bookingWindow.closed ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Booking window {bookingWindow.openTime} – {bookingWindow.closeTime}
                  {totalCapacity != null ? ` · ${totalCapacity} seats in dining room` : ''}
                </p>
              ) : null}

              {slots.length === 0 ? (
                <p className="rounded-lg bg-[var(--brand-ultra)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
                  {!availabilityChecked
                    ? 'Pick a date and tap “Check availability” to see open times.'
                    : 'No slots for this date. Try another day or a smaller party size.'}
                </p>
              ) : !hasBookableSlot ? (
                <p className="rounded-lg bg-[var(--amber-pale)] px-3 py-2.5 text-sm text-[var(--amber)]">
                  All times are full for your party. Try another date or join the waitlist below.
                </p>
              ) : (
                <ReservationTimeSlotGrid
                  slots={slots}
                  selectedSlot={form.selectedSlot}
                  onSelect={(startTime) =>
                    setForm((prev) => ({ ...prev, selectedSlot: startTime }))
                  }
                  totalCapacity={totalCapacity}
                />
              )}
            </div>

            {(showWaitlistForm || (availabilityChecked && !hasBookableSlot)) &&
            totalCapacity != null &&
            form.partySize <= totalCapacity ? (
              <div className="space-y-2 rounded-xl border border-[var(--amber-mid)]/30 bg-[var(--amber-pale)] p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--amber)]">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Join the waitlist
                </p>
                <p className="text-xs leading-relaxed text-[var(--text-mid)]">
                  Leave your details and the restaurant will reach out when a table opens.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="consumer-pressable w-full border-[var(--amber-mid)]/40"
                  disabled={joiningWaitlist || !form.customerName.trim()}
                  onClick={handleJoinWaitlist}
                >
                  {joiningWaitlist ? 'Joining…' : 'Join waitlist'}
                </Button>
              </div>
            ) : null}

            {totalCapacity != null && form.partySize > totalCapacity ? (
              <p className="text-sm text-[var(--red)]">
                Party of {form.partySize} exceeds dining room capacity ({totalCapacity}). Reduce
                guests or join the waitlist.
              </p>
            ) : null}
          </div>
        </PublicPanel>

        <PublicPanel
          title="Your details"
          description={`Contact info to confirm your table at ${restaurantName}.`}
          className="lg:min-w-0 lg:flex-1"
        >
          <form className="space-y-4" onSubmit={handleCreateReservation}>
            <div
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm',
                selectedSlotDetails
                  ? 'border-[var(--brand-light)]/40 bg-[var(--brand-pale)]/50 text-[var(--text)]'
                  : 'border-[var(--app-border)] bg-[var(--brand-ultra)] text-[var(--text-muted)]'
              )}
            >
              {selectedSlotDetails ? (
                <>
                  Booking for <strong>{form.partySize}</strong> guest
                  {form.partySize === 1 ? '' : 's'} on{' '}
                  <strong>{new Date(form.date).toLocaleDateString()}</strong> at{' '}
                  <strong>{formatTime(selectedSlotDetails.startTime)}</strong>.
                </>
              ) : (
                'Select a time above after checking availability.'
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="customerName">Name</Label>
                <Input
                  id="customerName"
                  className="mt-1.5"
                  value={form.customerName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, customerName: event.target.value }))
                  }
                  required
                  autoComplete="name"
                />
              </div>
              <div>
                <Label htmlFor="customerEmail">
                  Email <span className="text-[var(--red)]">*</span>
                </Label>
                <Input
                  id="customerEmail"
                  type="email"
                  className="mt-1.5"
                  value={form.customerEmail}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, customerEmail: event.target.value }))
                  }
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="customerPhone">
                  Phone <span className="text-[var(--red)]">*</span>
                </Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  className="mt-1.5"
                  value={form.customerPhone}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, customerPhone: event.target.value }))
                  }
                  required
                  autoComplete="tel"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Selected time</Label>
                <div className="mt-1.5 flex min-h-[44px] items-center rounded-lg border border-[var(--app-border)] px-3 text-sm">
                  {selectedSlotDetails ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{formatTime(selectedSlotDetails.startTime)}</Badge>
                      <span>{new Date(form.date).toLocaleDateString()}</span>
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">No time selected yet</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Special occasions, allergies, seating preferences…"
                className="mt-1.5 min-h-[100px]"
              />
            </div>

            <Button
              type="submit"
              disabled={creatingReservation || !canConfirm}
              className="consumer-pressable w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
            >
              {creatingReservation ? 'Reserving…' : 'Confirm reservation'}
            </Button>

            {!canConfirm && !creatingReservation ? (
              <p className="text-xs text-[var(--text-muted)]">
                {!form.selectedSlot
                  ? 'Select an available time after checking availability.'
                  : 'Enter your name, email, and phone to confirm.'}
              </p>
            ) : null}

            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              By booking you agree to receive reservation updates for this visit. Modify or cancel
              using the confirmation link sent after booking.
            </p>
          </form>
        </PublicPanel>
      </div>
    </PublicPageLayout>
  )
}

export default PublicReservationPortal
