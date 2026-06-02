import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  useValidateInviteQuery,
  useAcceptInviteMutation,
  useGetInviteSessionQuery,
} from '../services/api'
import { useAppDispatch } from '../hooks/redux'
import { Button } from '../components/ui/button'
import { api } from '../services/api'
import { normalizeInviteTypeParam } from '../lib/invite-types'
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
import { useSupplifyModel } from '../hooks/useSupplifyModel'

export function InviteAcceptPage() {
  const { isV2, config } = useSupplifyModel()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const type = normalizeInviteTypeParam(searchParams.get('type'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data: sessionUser, isLoading: sessionLoading } = useGetInviteSessionQuery()

  const { data, isLoading, isError } = useValidateInviteQuery(
    { token, type: type || 'sb' },
    { skip: !token || !type }
  )
  const [accept, { isLoading: accepting }] = useAcceptInviteMutation()

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
  const branchLabel = invite?.restaurant_name || invite?.branch_name || 'this branch'
  const orgLabel = invite?.org_name
  const isRestaurantMember = type === 'rm'
  const isRestaurantBranch = type === 'rb'
  const isSupplierRestaurant = type === 'sr'
  const loginHref = `/login?${searchParams.toString()}`
  const invitePath = `/invite?${searchParams.toString()}`

  const requiredInviteEmail = invite?.invited_email?.trim() || ''

  useEffect(() => {
    if (requiredInviteEmail) setEmail(requiredInviteEmail)
    else if (invite?.invited_email) setEmail((prev) => prev || invite.invited_email || '')
    if (invite?.invited_name) setFullName((prev) => prev || invite.invited_name || '')
  }, [requiredInviteEmail, invite?.invited_email, invite?.invited_name])

  if (!token || !type) {
    return (
      <PageShell>
        <p className="text-[var(--text-muted)]">Missing invitation token or type.</p>
      </PageShell>
    )
  }

  if (isLoading || sessionLoading) {
    return (
      <PageShell>
        <p>Validating your invitation…</p>
      </PageShell>
    )
  }

  if (isError || !invite) {
    return (
      <PageShell>
        <p className="text-[var(--text-muted)]">Unable to validate invitation.</p>
      </PageShell>
    )
  }

  if (!invite.valid && invite.reason === 'expired') {
    return (
      <PageShell className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">This invite link has expired.</h1>
        <p className="text-[var(--text-muted)]">
          Contact your organization admin to get a new one.
        </p>
      </PageShell>
    )
  }

  if (!invite.valid) {
    return (
      <PageShell className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">This invite link is no longer valid.</h1>
        <p className="text-[var(--text-muted)]">If you already have an account, sign in.</p>
        <Link to={loginHref} className="text-[var(--brand)] underline">
          Sign In
        </Link>
      </PageShell>
    )
  }

  const restaurantCopy = config.restaurant as {
    buyerInviteHeadline?: string
    buyerInviteBody?: string
  }
  const headline = isSupplierRestaurant
    ? isV2
      ? (restaurantCopy.buyerInviteHeadline ??
        `You were invited by ${orgLabel || invite?.supplier_name || 'a supplier'}`)
      : `You've been invited by ${orgLabel || 'a supplier'}`
    : isRestaurantMember
      ? `You've been invited to join ${branchLabel} as ${invite.role_name}`
      : isRestaurantBranch
        ? `You've been invited to manage ${branchLabel}${orgLabel ? ` — ${orgLabel}` : ''}`
        : `You've been invited to join ${branchLabel}${orgLabel ? ` (${orgLabel})` : ''} as ${invite.role_name}`

  const handleAcceptLoggedIn = async () => {
    setError(null)
    if (!legalPayload) {
      setError('Please accept all required legal agreements before continuing.')
      return
    }
    try {
      const result = await accept({ token, type, legalAcceptance: legalPayload }).unwrap()
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
        type,
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
      <PageShell>
        <Card>
          <h1 className="text-xl font-semibold">Accept invitation</h1>
          {emailMismatch && invite.invited_email ? (
            <InviteEmailMismatchCard
              invitedEmail={invite.invited_email}
              sessionEmail={sessionUser.email}
              invitePath={invitePath}
            />
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                You&apos;re logged in as {sessionUser.displayName || sessionUser.email}. {headline}.
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
                Accept & Join
              </Button>
              <Link
                to={loginHref}
                className="block text-center text-sm text-[var(--brand)] underline"
              >
                Sign in with a different account
              </Link>
            </>
          )}
        </Card>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <Card>
        <h1 className="text-xl font-semibold">Welcome to Supplify</h1>
        <p className="text-sm text-[var(--text-muted)]">{headline}.</p>
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
            Create Account & Join
          </Button>
        </form>
        <p className="text-xs text-center text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link to={loginHref} className="underline">
            Sign in
          </Link>
        </p>
      </Card>
    </PageShell>
  )
}

function PageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${className}`}>
      {children}
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-xl w-full space-y-4 border border-[var(--app-border)] rounded-lg p-6">
      {children}
    </div>
  )
}
