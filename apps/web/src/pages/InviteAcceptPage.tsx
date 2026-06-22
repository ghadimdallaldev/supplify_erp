import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
  isInvitationSessionExpiredError,
  finishInviteAcceptNavigation,
} from '../lib/invite-session'
import { InviteEmailMismatchCard } from '../components/invite/InviteEmailMismatchCard'
import { InviteSignupEmailField } from '../components/invite/InviteSignupEmailField'
import {
  LegalAcceptancePanel,
  isLegalAcceptanceComplete,
} from '../components/legal/LegalAcceptancePanel'
import { buildLegalAcceptancePayload, type LegalDocumentSlug } from '../lib/legalDocuments'
import { ensureNamespace } from '../i18n'

export function InviteAcceptPage() {
  const { t } = useTranslation('onboarding')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const type = normalizeInviteTypeParam(searchParams.get('type'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const {
    data: sessionUser,
    isLoading: sessionLoading,
    refetch: refetchInviteSession,
  } = useGetInviteSessionQuery(undefined, { refetchOnMountOrArgChange: true })

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
  const [sessionExpired, setSessionExpired] = useState(false)

  const legalComplete = isLegalAcceptanceComplete('invite', null, acceptedLegal, electronicSigned)
  const legalPayload = legalComplete ? buildLegalAcceptancePayload(acceptedLegal) : undefined

  const invite = data
  const branchLabel = invite?.restaurant_name || invite?.branch_name || t('invite.thisBranch')
  const orgLabel = invite?.org_name
  const isRestaurantMember = type === 'rm'
  const isRestaurantBranch = type === 'rb'
  const loginHref = `/login?${searchParams.toString()}`
  const invitePath = `/invite?${searchParams.toString()}`

  const requiredInviteEmail = invite?.invited_email?.trim() || ''

  useEffect(() => {
    void ensureNamespace('onboarding')
  }, [])

  useEffect(() => {
    if (requiredInviteEmail) setEmail(requiredInviteEmail)
    else if (invite?.invited_email) setEmail((prev) => prev || invite.invited_email || '')
    if (invite?.invited_name) setFullName((prev) => prev || invite.invited_name || '')
  }, [requiredInviteEmail, invite?.invited_email, invite?.invited_name])

  const headline = invite
    ? isRestaurantMember
      ? t('invite.headline.restaurantMember', {
          branch: branchLabel,
          role: invite.role_name,
        })
      : isRestaurantBranch
        ? orgLabel
          ? t('invite.headline.restaurantBranchWithOrg', { branch: branchLabel, org: orgLabel })
          : t('invite.headline.restaurantBranch', { branch: branchLabel })
        : orgLabel
          ? t('invite.headline.defaultWithOrg', {
              branch: branchLabel,
              org: orgLabel,
              role: invite.role_name,
            })
          : t('invite.headline.default', { branch: branchLabel, role: invite.role_name })
    : ''

  if (!token || !type) {
    return (
      <InvitePageLayout>
        <p className="text-[var(--text-muted)]">{t('invite.errors.missingToken')}</p>
      </InvitePageLayout>
    )
  }

  if (isLoading || sessionLoading) {
    return (
      <InvitePageLayout>
        <p>{t('invite.validating')}</p>
      </InvitePageLayout>
    )
  }

  if (isError || !invite) {
    return (
      <InvitePageLayout>
        <p className="text-[var(--text-muted)]">{t('invite.errors.validateFailed')}</p>
      </InvitePageLayout>
    )
  }

  if (!invite.valid && invite.reason === 'expired') {
    return (
      <InvitePageLayout className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">{t('invite.expired.title')}</h1>
        <p className="text-[var(--text-muted)]">{t('invite.expired.description')}</p>
      </InvitePageLayout>
    )
  }

  if (!invite.valid) {
    return (
      <InvitePageLayout className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">{t('invite.invalid.title')}</h1>
        <p className="text-[var(--text-muted)]">{t('invite.invalid.description')}</p>
        <Link to={loginHref} className="text-[var(--brand)] underline">
          {t('invite.signIn')}
        </Link>
      </InvitePageLayout>
    )
  }

  const handleAcceptLoggedIn = async () => {
    setError(null)
    if (!legalPayload) {
      setError(t('invite.errors.legalRequired'))
      return
    }
    try {
      const session = await refetchInviteSession().unwrap()
      const result = await accept({
        token,
        type,
        email: session?.email,
        legalAcceptance: legalPayload,
      }).unwrap()
      dispatch(api.util.resetApiState())
      const { refetchAppSession } = await import('../lib/refetchAppSession')
      await refetchAppSession(dispatch)
      finishInviteAcceptNavigation(result, navigate, searchParams)
    } catch (err) {
      if (isInvitationSessionExpiredError(err)) {
        setSessionExpired(true)
      }
      setError(invitationAcceptErrorMessage(err, t('invite.errors.acceptFailed')))
    }
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError(t('invite.errors.passwordMismatch'))
      return
    }
    if (password.length < 8) {
      setError(t('invite.errors.passwordTooShort'))
      return
    }
    const signupEmail = (requiredInviteEmail || email).trim()
    if (!formEmailMatchesInvite(requiredInviteEmail || invite?.invited_email, signupEmail)) {
      setError(inviteFormEmailMismatchMessage(requiredInviteEmail))
      return
    }
    if (!legalPayload) {
      setError(t('invite.errors.legalRequired'))
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
      const { refetchAppSession } = await import('../lib/refetchAppSession')
      await refetchAppSession(dispatch)
      finishInviteAcceptNavigation(result, navigate, searchParams)
    } catch (err) {
      setError(invitationAcceptErrorMessage(err, t('invite.errors.createFailed')))
    }
  }

  const emailMismatch =
    sessionUser && inviteSessionEmailMismatch(invite.invited_email, sessionUser.email)

  if (sessionUser && !sessionExpired) {
    return (
      <InvitePageLayout>
        <Card>
          <h1 className="text-xl font-semibold">{t('invite.acceptTitle')}</h1>
          {emailMismatch && invite.invited_email ? (
            <InviteEmailMismatchCard
              invitedEmail={invite.invited_email}
              sessionEmail={sessionUser.email}
              invitePath={invitePath}
            />
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                {t('invite.loggedInAs', {
                  name: sessionUser.displayName || sessionUser.email,
                  headline,
                })}
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
                {t('invite.acceptJoin')}
              </Button>
              <Link
                to={loginHref}
                className="block text-center text-sm text-[var(--brand)] underline"
              >
                {t('invite.signInDifferent')}
              </Link>
            </>
          )}
        </Card>
      </InvitePageLayout>
    )
  }

  return (
    <InvitePageLayout>
      <Card>
        <h1 className="text-xl font-semibold">{t('invite.welcome')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{headline}.</p>
        <form className="space-y-3" onSubmit={(e) => handleCreateAccount(e)}>
          <label className="block text-sm">
            {t('invite.fullName')}
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
            {t('invite.password')}
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
            {t('invite.confirmPassword')}
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
            {t('invite.createAndJoin')}
          </Button>
        </form>
        <p className="text-xs text-center text-[var(--text-muted)]">
          {t('invite.alreadyHaveAccount')}{' '}
          <Link to={loginHref} className="underline">
            {t('invite.signInLink')}
          </Link>
        </p>
      </Card>
    </InvitePageLayout>
  )
}

function InvitePageLayout({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
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
