import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useAcceptWaitlistOfferMutation, useDeclineWaitlistOfferMutation } from '../services/api'
import { toast } from 'react-hot-toast'

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
      <div className="flex min-h-screen items-center justify-center bg-slate-900/90 text-white">
        <p className="text-sm text-[var(--text-muted)]">Missing waitlist offer token.</p>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/90 px-4 py-12">
        <Card className="w-full max-w-md border-white/10 bg-white/95 text-[var(--text)] shadow-xl">
          <CardHeader>
            <CardTitle>Offer expired</CardTitle>
            <CardDescription>
              This table offer is no longer active. You may still be on the waitlist — the
              restaurant will contact you if another table opens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/reserve')}>
              Return to booking
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/90 px-4 py-12">
        <Card className="w-full max-w-md border-white/10 bg-white/95 text-[var(--text)] shadow-xl">
          <CardHeader>
            <CardTitle>{action === 'accept' ? 'Table confirmed' : 'Offer declined'}</CardTitle>
            <CardDescription>
              {action === 'accept'
                ? 'Your reservation is confirmed. Use your management link to view or change your booking.'
                : 'You have declined this table offer. The restaurant may offer the next guest in line.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/reserve')}>
              Return to booking
            </Button>
          </CardContent>
        </Card>
      </div>
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
    <div className="flex min-h-screen items-center justify-center bg-slate-900/90 px-4 py-12">
      <Card className="w-full max-w-md border-white/10 bg-white/95 text-[var(--text)] shadow-xl">
        <CardHeader>
          <CardTitle>{action === 'accept' ? 'Table available' : 'Decline table offer'}</CardTitle>
          <CardDescription>
            {action === 'accept'
              ? 'A table has opened for your party. Accept within 2 hours to confirm your reservation.'
              : 'Let the restaurant know you no longer want this table so they can offer it to the next guest.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {action === 'accept' ? (
            <Button className="w-full" disabled={accepting} onClick={handleAccept}>
              {accepting ? 'Confirming…' : 'Accept table'}
            </Button>
          ) : (
            <Button
              variant="destructive"
              className="w-full"
              disabled={declining}
              onClick={handleDecline}
            >
              {declining ? 'Declining…' : 'Decline offer'}
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={() => navigate('/reserve')}>
            Back to booking
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default PublicReservationWaitlistOffer
