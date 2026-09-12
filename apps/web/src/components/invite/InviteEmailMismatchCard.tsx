import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/button'
import { redirectToLogoutForInvite } from '../../lib/invite-session'

type Props = {
  invitedEmail: string
  sessionEmail: string
  invitePath: string
}

export function InviteEmailMismatchCard({ invitedEmail, sessionEmail, invitePath }: Props) {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm text-[var(--text-muted)]">
        <p>
          You&apos;re signed in as: <strong>{sessionEmail}</strong>
        </p>
        <p>
          This invitation is for: <strong>{invitedEmail}</strong>
        </p>
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        To accept this invitation, you need to sign out of your current account first.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          className="flex-1"
          onClick={() => redirectToLogoutForInvite(invitePath)}
        >
          Sign out and continue
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={() => navigate('/app')}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
