import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ensureNamespace } from '../i18n'
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
  const { t } = useTranslation('reservations')
  const { restaurantIdOrSlug } = useParams<{ restaurantIdOrSlug?: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    void ensureNamespace('reservations')
  }, [])

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

  const slots = useMemo(() => availabilityData?.slots ?? [], [availabilityData?.slots])
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
      toast.error(t('portal.chooseDate'))
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
        toast.error(t('portal.maxCapacity', { capacity: result.totalCapacity }))
        setShowWaitlistForm(true)
        return
      }
      setShowWaitlistForm(false)
      toast.success(t('portal.availabilityUpdated'))
    } catch (error: unknown) {
      setAvailabilityChecked(false)
      const err = error as { data?: { message?: string; error?: { message?: string } } }
      toast.error(
        err?.data?.message || err?.data?.error?.message || t('portal.checkAvailabilityFailed')
      )
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
      toast.error(t('portal.selectTimeSlot'))
      return
    }
    if (!form.customerEmail.trim()) {
      toast.error(t('portal.emailRequired'))
      return
    }
    if (!form.customerPhone.trim()) {
      toast.error(t('portal.phoneRequired'))
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

      toast.success(t('portal.reservationConfirmed'))
      const reservation = response.reservation
      navigate(`/reserve/confirmation?token=${reservation.manageToken}`)
    } catch (error: unknown) {
      const err = error as { data?: { message?: string; error?: { message?: string } } }
      const message =
        err?.data?.error?.message || err?.data?.message || t('portal.createReservationFailed')
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
      toast.error(t('portal.enterNameForWaitlist'))
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
      toast.success(t('portal.waitlistJoined'))
      setShowWaitlistForm(false)
    } catch (error: unknown) {
      const err = error as { data?: { message?: string; error?: { message?: string } } }
      toast.error(err?.data?.error?.message || err?.data?.message || t('portal.joinWaitlistFailed'))
    }
  }

  if (!restaurantIdOrSlug) {
    return (
      <PublicPageLayout
        centered
        narrow
        title={t('portal.missingLinkTitle')}
        subtitle={t('portal.missingLinkSubtitle')}
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
        title={t('portal.restaurantNotFoundTitle')}
        subtitle={t('portal.restaurantNotFoundSubtitle')}
      />
    )
  }

  const restaurantName = restaurant.name

  return (
    <PublicPageLayout
      title={t('portal.bookAt', { name: restaurantName })}
      subtitle={t('portal.bookAtSubtitle')}
      logoInitial={restaurantName.charAt(0).toUpperCase()}
      className="pb-12"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        <PublicPanel
          title={t('portal.whenComingTitle')}
          description={t('portal.whenComingDescription')}
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
                  {t('portal.partySize')}
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
                  {t('portal.date')}
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
              {loadingAvailability ? t('portal.checking') : t('portal.checkAvailability')}
            </Button>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-[var(--text-mid)]">
                <Clock3 className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden />
                {t('portal.availableTimes')}
              </Label>
              {bookingWindow?.openTime && bookingWindow?.closeTime && !bookingWindow.closed ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {t('portal.bookingWindow', {
                    open: bookingWindow.openTime,
                    close: bookingWindow.closeTime,
                  })}
                  {totalCapacity != null
                    ? t('portal.seatsInDiningRoom', { count: totalCapacity })
                    : ''}
                </p>
              ) : null}

              {slots.length === 0 ? (
                <p className="rounded-lg bg-[var(--brand-ultra)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
                  {!availabilityChecked ? t('portal.pickDateHint') : t('portal.noSlotsHint')}
                </p>
              ) : !hasBookableSlot ? (
                <p className="rounded-lg bg-[var(--amber-pale)] px-3 py-2.5 text-sm text-[var(--amber)]">
                  {t('portal.allTimesFullHint')}
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
                  {t('portal.joinWaitlistTitle')}
                </p>
                <p className="text-xs leading-relaxed text-[var(--text-mid)]">
                  {t('portal.joinWaitlistDescription')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="consumer-pressable w-full border-[var(--amber-mid)]/40"
                  disabled={joiningWaitlist || !form.customerName.trim()}
                  onClick={handleJoinWaitlist}
                >
                  {joiningWaitlist ? t('portal.joining') : t('portal.joinWaitlist')}
                </Button>
              </div>
            ) : null}

            {totalCapacity != null && form.partySize > totalCapacity ? (
              <p className="text-sm text-[var(--red)]">
                {t('portal.partyExceedsCapacity', {
                  partySize: form.partySize,
                  capacity: totalCapacity,
                })}
              </p>
            ) : null}
          </div>
        </PublicPanel>

        <PublicPanel
          title={t('portal.yourDetailsTitle')}
          description={t('portal.yourDetailsDescription', { name: restaurantName })}
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
              {selectedSlotDetails
                ? t('portal.bookingSummary', {
                    count: form.partySize,
                    partySize: form.partySize,
                    date: new Date(form.date).toLocaleDateString(),
                    time: formatTime(selectedSlotDetails.startTime),
                  })
                : t('portal.selectTimeHint')}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="customerName">{t('portal.name')}</Label>
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
                  {t('portal.email')} <span className="text-[var(--red)]">*</span>
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
                  {t('portal.phone')} <span className="text-[var(--red)]">*</span>
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
                <Label>{t('portal.selectedTime')}</Label>
                <div className="mt-1.5 flex min-h-[44px] items-center rounded-lg border border-[var(--app-border)] px-3 text-sm">
                  {selectedSlotDetails ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{formatTime(selectedSlotDetails.startTime)}</Badge>
                      <span>{new Date(form.date).toLocaleDateString()}</span>
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">{t('portal.noTimeSelected')}</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">{t('portal.notes')}</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder={t('portal.notesPlaceholder')}
                className="mt-1.5 min-h-[100px]"
              />
            </div>

            <Button
              type="submit"
              disabled={creatingReservation || !canConfirm}
              className="consumer-pressable w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
            >
              {creatingReservation ? t('portal.reserving') : t('portal.confirmReservation')}
            </Button>

            {!canConfirm && !creatingReservation ? (
              <p className="text-xs text-[var(--text-muted)]">
                {!form.selectedSlot
                  ? t('portal.selectTimeToConfirm')
                  : t('portal.enterContactToConfirm')}
              </p>
            ) : null}

            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              {t('portal.bookingAgreement')}
            </p>
          </form>
        </PublicPanel>
      </div>
    </PublicPageLayout>
  )
}

export default PublicReservationPortal
