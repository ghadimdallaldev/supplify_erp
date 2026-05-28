import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  useValidateBranchInviteQuery,
  useAcceptBranchInviteMutation,
  useGetInviteSessionQuery,
} from '../services/api'
import { Button } from '../components/ui/button'
import { api } from '../services/api'
import { useAppDispatch } from '../hooks/redux'
import {
  formEmailMatchesInvite,
  inviteFormEmailMismatchMessage,
  inviteSessionEmailMismatch,
  invitationAcceptErrorMessage,
  finishInviteAcceptNavigation,
} from '../lib/invite-session'
import { InviteEmailMismatchCard } from '../components/invite/InviteEmailMismatchCard'
import { InviteSignupEmailField } from '../components/invite/InviteSignupEmailField'
import {
  LegalAcceptancePanel,
  isLegalAcceptanceComplete,
} from '../components/legal/LegalAcceptancePanel'
import { buildLegalAcceptancePayload, type LegalDocumentSlug } from '../lib/legalDocuments'

export function BranchInviteAcceptPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data: sessionUser, isLoading: sessionLoading } = useGetInviteSessionQuery()

  const { data, isLoading, isError } = useValidateBranchInviteQuery(token, { skip: !token })
  const [accept, { isLoading: accepting }] = useAcceptBranchInviteMutation()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedLegal, setAcceptedLegal] = useState<Set<LegalDocumentSlug>>(new Set())
  const [electronicSigned, setElectronicSigned] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const legalComplete = isLegalAcceptanceComplete('invite', null, acceptedLegal, electronicSigned)
  const legalPayload = legalComplete ? buildLegalAcceptancePayload(acceptedLegal) : undefined

  const invite = data
  const loginHref = `/login?${searchParams.toString()}`
  const invitePath = `/invite/branch?${searchParams.toString()}`

  const requiredInviteEmail = invite?.invited_email?.trim() || ''

  useEffect(() => {
    if (requiredInviteEmail) setEmail(requiredInviteEmail)
    else if (invite?.invited_email) setEmail((prev) => prev || invite.invited_email || '')
    if (invite?.invited_name) setFullName((prev) => prev || invite.invited_name || '')
  }, [requiredInviteEmail, invite?.invited_email, invite?.invited_name])

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-[var(--text-muted)]">Missing invitation token.</p>
      </div>
    )
  }

  if (isLoading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p>Validating your invitation…</p>
      </div>
    )
  }

  if (isError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-[var(--text-muted)]">Unable to validate invitation.</p>
      </div>
    )
  }

  if (!invite.valid && invite.reason === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">This invite link has expired.</h1>
        <p className="text-[var(--text-muted)]">
          Contact your organization admin to get a new one.
        </p>
      </div>
    )
  }

  if (!invite.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">This invite link is no longer valid.</h1>
        <p className="text-[var(--text-muted)]">If you already have an account, sign in.</p>
        <Link to={loginHref} className="text-[var(--brand)] underline">
          Sign In
        </Link>
      </div>
    )
  }

  const handleAcceptLoggedIn = async () => {
    setError(null)
    if (!legalPayload) {
      setError('Please accept all required legal agreements before continuing.')
      return
    }
    try {
      const result = await accept({ token, legalAcceptance: legalPayload }).unwrap()
      dispatch(api.util.resetApiState())
      finishInviteAcceptNavigation(result, navigate, searchParams)
    } catch (err) {
      setError(
        invitationAcceptErrorMessage(
          err,
          'Could not accept invitation. Try signing in with a different account.'
        )
      )
    }
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    const signupEmail = (requiredInviteEmail || email).trim()
    if (!formEmailMatchesInvite(requiredInviteEmail || invite?.invited_email, signupEmail)) {
      setError(inviteFormEmailMismatchMessage(requiredInviteEmail))
      return
    }
    if (!legalPayload) {
      setError('Please accept all required legal agreements before continuing.')
      return
    }
    try {
      const result = await accept({
        token,
        full_name: fullName.trim(),
        email: signupEmail,
        password,
        legalAcceptance: legalPayload,
      }).unwrap()
      dispatch(api.util.resetApiState())
      finishInviteAcceptNavigation(result, navigate, searchParams)
    } catch (err) {
      setError(
        invitationAcceptErrorMessage(
          err,
          'Could not create your account. The link may have expired.'
        )
      )
    }
  }

  const emailMismatch =
    sessionUser && inviteSessionEmailMismatch(invite.invited_email, sessionUser.email)

  if (sessionUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-xl w-full space-y-4 border border-[var(--app-border)] rounded-lg p-6">
          <h1 className="text-xl font-semibold">Accept branch invitation</h1>
          {emailMismatch && invite.invited_email ? (
            <InviteEmailMismatchCard
              invitedEmail={invite.invited_email}
              sessionEmail={sessionUser.email}
              invitePath={invitePath}
            />
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                You&apos;re logged in as {sessionUser.displayName || sessionUser.email}. This invite
                is for <strong>{invite.branch_name}</strong> ({invite.org_name}) as{' '}
                {invite.role_name}.
              </p>
              <LegalAcceptancePanel
                variant="invite"
                value={acceptedLegal}
                onChange={setAcceptedLegal}
                electronicSigned={electronicSigned}
                onElectronicSignedChange={setElectronicSigned}
                disabled={accepting}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                type="button"
                className="w-full"
                disabled={accepting || !legalComplete}
                onClick={() => handleAcceptLoggedIn()}
              >
                Accept & Join Branch
              </Button>
              <Link
                to={loginHref}
                className="block text-center text-sm text-[var(--brand)] underline"
              >
                Sign in with a different account
              </Link>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-4 border border-[var(--app-border)] rounded-lg p-6">
        <h1 className="text-xl font-semibold">Welcome to Supplify</h1>
        <p className="text-sm text-[var(--text-muted)]">
          You&apos;ve been invited to join <strong>{invite.branch_name}</strong> ({invite.org_name})
          as <strong>{invite.role_name}</strong>.
        </p>
        <form className="space-y-3" onSubmit={(e) => handleCreateAccount(e)}>
          <label className="block text-sm">
            Full name
            <input
              className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <InviteSignupEmailField
            invitedEmail={requiredInviteEmail || invite?.invited_email}
            value={email}
            onChange={setEmail}
          />
          <label className="block text-sm">
            Password
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="block text-sm">
            Confirm password
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-[var(--app-border)] px-3 py-2"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <LegalAcceptancePanel
            variant="invite"
            value={acceptedLegal}
            onChange={setAcceptedLegal}
            electronicSigned={electronicSigned}
            onElectronicSignedChange={setElectronicSigned}
            disabled={accepting}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={accepting || !legalComplete}>
            Create Account & Join Branch
          </Button>
        </form>
        <p className="text-xs text-center text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link to="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
