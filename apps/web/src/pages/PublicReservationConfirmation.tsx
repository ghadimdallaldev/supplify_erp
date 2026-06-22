import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ensureNamespace } from '../i18n'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { useGetPublicReservationDetailsQuery } from '../services/api'
import { PublicPageLayout, PublicPanel } from '../components/public/PublicPageLayout'
import { CalendarCheck, Loader2 } from 'lucide-react'

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
  const { t } = useTranslation('reservations')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  useEffect(() => {
    void ensureNamespace('reservations')
  }, [])

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
    <PublicPageLayout
      centered
      narrow
      title={t('confirmation.title')}
      subtitle={
        restaurantName
          ? t('confirmation.subtitleWithRestaurant', { name: restaurantName })
          : t('confirmation.subtitleGeneric')
      }
    >
      <PublicPanel className="w-full">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-mid)]" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : isError || !reservation ? (
          <p className="py-4 text-center text-sm leading-relaxed text-[var(--text-muted)]">
            {token ? t('confirmation.loadErrorWithToken') : t('confirmation.loadErrorNoToken')}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--mint-pale)] text-[var(--mint)]">
                <CalendarCheck className="h-6 w-6" aria-hidden />
              </span>
            </div>
            <dl className="divide-y divide-[var(--app-border)] text-sm">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[var(--text-muted)]">{t('confirmation.status')}</dt>
                <dd>
                  <Badge variant="outline" className="capitalize">
                    {reservation.status?.toLowerCase()}
                  </Badge>
                </dd>
              </div>
              {when ? (
                <>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-[var(--text-muted)]">{t('confirmation.date')}</dt>
                    <dd className="text-right font-medium text-[var(--text)]">{when.date}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2.5">
                    <dt className="text-[var(--text-muted)]">{t('confirmation.time')}</dt>
                    <dd className="font-medium tabular-nums text-[var(--text)]">{when.time}</dd>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-[var(--text-muted)]">{t('confirmation.partySize')}</dt>
                <dd className="font-medium text-[var(--text)]">
                  {t('confirmation.guests', { count: partySize ?? 0 })}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-[var(--text-muted)]">{t('confirmation.name')}</dt>
                <dd className="font-medium text-[var(--text)]">{customerName}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-6 space-y-3">
          {manageHref ? (
            <>
              <Button
                asChild
                className="consumer-pressable w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
              >
                <Link to={manageHref}>{t('confirmation.manageOrCancel')}</Link>
              </Button>
              <p className="text-center text-xs text-[var(--text-muted)]">
                {t('confirmation.manageHint')}
              </p>
            </>
          ) : null}

          <Button asChild variant="outline" className="consumer-pressable w-full">
            <Link to={restaurantSlug ? `/reserve/${restaurantSlug}` : '/reserve'}>
              {t('confirmation.bookAnotherTable')}
            </Link>
          </Button>
        </div>
      </PublicPanel>
    </PublicPageLayout>
  )
}

export default PublicReservationConfirmation
