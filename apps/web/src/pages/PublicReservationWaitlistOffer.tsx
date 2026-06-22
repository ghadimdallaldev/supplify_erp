import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ensureNamespace } from '../i18n'
import { Button } from '../components/ui/button'
import { useAcceptWaitlistOfferMutation, useDeclineWaitlistOfferMutation } from '../services/api'
import { PublicPageLayout, PublicPanel } from '../components/public/PublicPageLayout'
import { toast } from 'sonner'

type OfferAction = 'accept' | 'decline'

function extractApiError(error: unknown, fallback: string) {
  const err = error as {
    data?: { message?: string; error?: { message?: string } }
    status?: number
  }
  return err?.data?.error?.message || err?.data?.message || fallback
}

export function PublicReservationWaitlistOffer({ action }: { action: OfferAction }) {
  const { t } = useTranslation('reservations')
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [completed, setCompleted] = useState(false)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    void ensureNamespace('reservations')
  }, [])

  const [acceptOffer, { isLoading: accepting }] = useAcceptWaitlistOfferMutation()
  const [declineOffer, { isLoading: declining }] = useDeclineWaitlistOfferMutation()

  if (!token) {
    return (
      <PublicPageLayout
        centered
        narrow
        title={t('waitlistOffer.linkRequiredTitle')}
        subtitle={t('waitlistOffer.linkRequiredSubtitle')}
      />
    )
  }

  if (expired) {
    return (
      <PublicPageLayout
        centered
        narrow
        title={t('waitlistOffer.expiredTitle')}
        subtitle={t('waitlistOffer.expiredSubtitle')}
      >
        <Button
          variant="outline"
          className="consumer-pressable w-full"
          onClick={() => navigate('/reserve')}
        >
          {t('waitlistOffer.returnToBooking')}
        </Button>
      </PublicPageLayout>
    )
  }

  if (completed) {
    return (
      <PublicPageLayout
        centered
        narrow
        title={
          action === 'accept'
            ? t('waitlistOffer.tableConfirmedTitle')
            : t('waitlistOffer.offerDeclinedTitle')
        }
        subtitle={
          action === 'accept'
            ? t('waitlistOffer.acceptedSubtitle')
            : t('waitlistOffer.declinedSubtitle')
        }
      >
        <Button
          variant="outline"
          className="consumer-pressable w-full"
          onClick={() => navigate('/reserve')}
        >
          {t('waitlistOffer.returnToBooking')}
        </Button>
      </PublicPageLayout>
    )
  }

  const handleAccept = async () => {
    try {
      const result = await acceptOffer(token).unwrap()
      const managePath =
        result.manageToken != null
          ? `/reserve/manage/${result.manageToken}`
          : result.manageUrl != null
            ? new URL(result.manageUrl).pathname
            : null
      toast.success(t('waitlistOffer.tableConfirmedToast'))
      if (managePath) {
        navigate(managePath, { replace: true })
        return
      }
      setCompleted(true)
    } catch (error: unknown) {
      const err = error as { status?: number }
      if (err?.status === 410) {
        setExpired(true)
        return
      }
      toast.error(extractApiError(error, t('waitlistOffer.acceptFailed')))
    }
  }

  const handleDecline = async () => {
    try {
      await declineOffer(token).unwrap()
      toast.success(t('waitlistOffer.offerDeclinedToast'))
      setCompleted(true)
    } catch (error: unknown) {
      const err = error as { status?: number }
      if (err?.status === 410) {
        setExpired(true)
        return
      }
      toast.error(extractApiError(error, t('waitlistOffer.declineFailed')))
    }
  }

  return (
    <PublicPageLayout
      centered
      narrow
      title={
        action === 'accept'
          ? t('waitlistOffer.tableAvailableTitle')
          : t('waitlistOffer.declineOfferTitle')
      }
      subtitle={
        action === 'accept' ? t('waitlistOffer.acceptSubtitle') : t('waitlistOffer.declineSubtitle')
      }
    >
      <PublicPanel className="w-full space-y-3">
        {action === 'accept' ? (
          <Button
            className="consumer-pressable w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
            disabled={accepting}
            onClick={handleAccept}
          >
            {accepting ? t('waitlistOffer.confirming') : t('waitlistOffer.acceptTable')}
          </Button>
        ) : (
          <Button
            variant="destructive"
            className="consumer-pressable w-full"
            disabled={declining}
            onClick={handleDecline}
          >
            {declining ? t('waitlistOffer.declining') : t('waitlistOffer.declineOffer')}
          </Button>
        )}
        <Button
          variant="outline"
          className="consumer-pressable w-full"
          onClick={() => navigate('/reserve')}
        >
          {t('waitlistOffer.backToBooking')}
        </Button>
      </PublicPanel>
    </PublicPageLayout>
  )
}

export default PublicReservationWaitlistOffer
