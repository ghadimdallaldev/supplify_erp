import { Button } from '../ui/button'
import { redirectToLogoutForInvite } from '../../lib/invite-session'

type Props = {
  invitedEmail: string
  sessionEmail: string
  invitePath: string
}

export function InviteEmailMismatchCard({ invitedEmail, sessionEmail, invitePath }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        This invitation is tied to <strong>{invitedEmail}</strong>. You&apos;re signed in as{' '}
        <strong>{sessionEmail}</strong>, so you can&apos;t accept it from this account.
      </p>
      <p className="text-sm text-[var(--text-muted)]">
        You don&apos;t need an existing account for <strong>{invitedEmail}</strong>. Sign out of{' '}
        {sessionEmail} first — you&apos;ll return to this invite link and choose a password there
        (full name, email, password). That creates your user and accepts the invite in one step.
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        Only use the normal Sign in page if you already registered {invitedEmail} before. If this
        invite should go to {sessionEmail} instead, ask your admin to send a new invitation to that
        address.
      </p>
      <Button
        type="button"
        className="w-full"
        onClick={() => redirectToLogoutForInvite(invitePath)}
      >
        Sign out — then create account as {invitedEmail}
      </Button>
    </div>
  )
}
