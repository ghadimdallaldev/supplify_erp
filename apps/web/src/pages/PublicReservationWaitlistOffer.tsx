import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [completed, setCompleted] = useState(false)
  const [expired, setExpired] = useState(false)

  const [acceptOffer, { isLoading: accepting }] = useAcceptWaitlistOfferMutation()
  const [declineOffer, { isLoading: declining }] = useDeclineWaitlistOfferMutation()

  if (!token) {
    return (
      <PublicPageLayout
        centered
        narrow
        title="Link required"
        subtitle="Open this page from the waitlist offer in your email or text message."
      />
    )
  }

  if (expired) {
    return (
      <PublicPageLayout
        centered
        narrow
        title="Offer expired"
        subtitle="This table offer is no longer active. You may still be on the waitlist — the restaurant will contact you if another table opens."
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

  if (completed) {
    return (
      <PublicPageLayout
        centered
        narrow
        title={action === 'accept' ? 'Table confirmed' : 'Offer declined'}
        subtitle={
          action === 'accept'
            ? 'Your reservation is confirmed. Use your management link to view or change your booking.'
            : 'You declined this table offer. The restaurant may offer the next guest in line.'
        }
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

  const handleAccept = async () => {
    try {
      const result = await acceptOffer(token).unwrap()
      const managePath =
        result.manageToken != null
          ? `/reserve/manage/${result.manageToken}`
          : result.manageUrl != null
            ? new URL(result.manageUrl).pathname
            : null
      toast.success('Table confirmed!')
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
      toast.error(extractApiError(error, 'Could not accept this offer'))
    }
  }

  const handleDecline = async () => {
    try {
      await declineOffer(token).unwrap()
      toast.success('Offer declined')
      setCompleted(true)
    } catch (error: unknown) {
      const err = error as { status?: number }
      if (err?.status === 410) {
        setExpired(true)
        return
      }
      toast.error(extractApiError(error, 'Could not decline offer'))
    }
  }

  return (
    <PublicPageLayout
      centered
      narrow
      title={action === 'accept' ? 'Table available' : 'Decline table offer'}
      subtitle={
        action === 'accept'
          ? 'A table has opened for your party. Accept within 2 hours to confirm your reservation.'
          : 'Let the restaurant know you no longer want this table so they can offer it to the next guest.'
      }
    >
      <PublicPanel className="w-full space-y-3">
        {action === 'accept' ? (
          <Button
            className="consumer-pressable w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
            disabled={accepting}
            onClick={handleAccept}
          >
            {accepting ? 'Confirming…' : 'Accept table'}
          </Button>
        ) : (
          <Button
            variant="destructive"
            className="consumer-pressable w-full"
            disabled={declining}
            onClick={handleDecline}
          >
            {declining ? 'Declining…' : 'Decline offer'}
          </Button>
        )}
        <Button
          variant="outline"
          className="consumer-pressable w-full"
          onClick={() => navigate('/reserve')}
        >
          Back to booking
        </Button>
      </PublicPanel>
    </PublicPageLayout>
  )
}

export default PublicReservationWaitlistOffer
