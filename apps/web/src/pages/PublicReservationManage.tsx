import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ensureNamespace } from '../i18n'
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
  const { t } = useTranslation('reservations')
  const params = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = params.token ?? ''
  const waitlistAccepted = searchParams.get('waitlistAccepted') === 'true'

  useEffect(() => {
    void ensureNamespace('reservations')
  }, [])

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
        title={t('manage.linkRequiredTitle')}
        subtitle={t('manage.linkRequiredSubtitle')}
      />
    )
  }

  if (isLoading) {
    return (
      <PublicPageLayout narrow title={t('manage.title')}>
        <Skeleton className="h-48 w-full rounded-xl" />
      </PublicPageLayout>
    )
  }

  if (!reservation) {
    return (
      <PublicPageLayout
        centered
        narrow
        title={t('manage.notFoundTitle')}
        subtitle={t('manage.notFoundSubtitle')}
      >
        <Button
          variant="outline"
          className="consumer-pressable w-full"
          onClick={() => navigate('/reserve')}
        >
          {t('manage.returnToBooking')}
        </Button>
      </PublicPageLayout>
    )
  }

  const handleReschedule = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!rescheduleSlot) {
      toast.error(t('manage.pickNewTime'))
      return
    }
    try {
      await rescheduleReservation({ token, scheduledAt: rescheduleSlot }).unwrap()
      toast.success(t('manage.rescheduled'))
      setRescheduleSlot('')
      refetch()
    } catch (error: unknown) {
      toast.error(extractApiError(error, t('manage.rescheduleFailed')))
    }
  }

  const handleCancel = async () => {
    if (!window.confirm(t('manage.cancelConfirm'))) return
    try {
      await cancelReservation({ token }).unwrap()
      toast.success(t('manage.cancelled'))
      refetch()
    } catch (error: unknown) {
      toast.error(extractApiError(error, t('manage.cancelFailed')))
    }
  }

  return (
    <PublicPageLayout title={t('manage.title')} subtitle={t('manage.subtitle')} className="pb-12">
      {waitlistAccepted && (
        <div className="mx-auto mb-5 max-w-3xl rounded-xl border border-[var(--mint-light)]/40 bg-[var(--mint-pale)] px-4 py-3 text-sm text-[var(--mint)]">
          {t('manage.waitlistAcceptedBanner')}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        <PublicPanel title={t('manage.currentBooking')} className="lg:w-[42%] lg:shrink-0">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[var(--text-muted)]">{t('manage.status')}</dt>
              <dd className="mt-1">
                <Badge variant="outline" className="capitalize">
                  {reservation.status.toLowerCase()}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">{t('manage.when')}</dt>
              <dd className="mt-1 font-semibold text-[var(--text)]">
                {formatDateTime(reservation.scheduled_at)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">{t('manage.guests')}</dt>
              <dd className="mt-1 font-semibold text-[var(--text)]">{reservation.party_size}</dd>
            </div>
            <div>
              <Label htmlFor="resNotes">{t('manage.specialNotes')}</Label>
              <Textarea
                id="resNotes"
                readOnly
                value={reservation.notes ?? ''}
                placeholder={t('manage.none')}
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
              {cancelling ? t('manage.cancelling') : t('manage.cancelReservation')}
            </Button>
            <Button
              variant="outline"
              className="consumer-pressable w-full"
              onClick={() => navigate('/reserve')}
            >
              {t('manage.bookAnotherTable')}
            </Button>
          </div>
        </PublicPanel>

        <PublicPanel
          title={t('manage.rescheduleTitle')}
          description={t('manage.rescheduleDescription')}
          className="lg:min-w-0 lg:flex-1"
        >
          <form className="space-y-4" onSubmit={handleReschedule}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rescheduleDate">{t('manage.date')}</Label>
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
                <Label htmlFor="guestCount">{t('manage.guests')}</Label>
                <Input id="guestCount" className="mt-1.5" value={reservation.party_size} disabled />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('manage.availableTimes')}</Label>
              {slots.length === 0 ? (
                <p className="rounded-lg bg-[var(--brand-ultra)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
                  {t('manage.noAvailability')}
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
              {rescheduling ? t('manage.updating') : t('manage.confirmNewTime')}
            </Button>
          </form>
        </PublicPanel>
      </div>
    </PublicPageLayout>
  )
}

export default PublicReservationManage
