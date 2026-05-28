import { getOAuthStartUrl } from './authRedirect'
import type { User } from '../types'

export function normalizeInviteEmail(email: string | undefined | null): string {
  return (email || '').trim().toLowerCase()
}

/** True when invitation targets a specific email that does not match the signed-in user. */
export function inviteSessionEmailMismatch(
  invitedEmail: string | undefined,
  sessionEmail: string | undefined
): boolean {
  const invited = normalizeInviteEmail(invitedEmail)
  const session = normalizeInviteEmail(sessionEmail)
  return Boolean(invited && session && invited !== session)
}

export function formEmailMatchesInvite(
  invitedEmail: string | undefined,
  formEmail: string
): boolean {
  const invited = normalizeInviteEmail(invitedEmail)
  if (!invited) return true
  return normalizeInviteEmail(formEmail) === invited
}

export function inviteFormEmailMismatchMessage(invitedEmail: string): string {
  return `This invitation was sent to ${invitedEmail}. You must sign up with that exact email address.`
}

export function invitationAcceptErrorMessage(err: unknown, fallback: string): string {
  const payload = (err as { data?: { message?: string; name?: string } })?.data
  if (payload?.message) return payload.message
  if (payload?.name === 'INVITATION_EMAIL_MISMATCH') {
    return 'Email must match the address this invitation was created for.'
  }
  if (payload?.name === 'KEYCLOAK_NOT_CONFIGURED') {
    return 'Account signup is not configured on the server (Keycloak admin). Ask your administrator or set KEYCLOAK_ADMIN_PASSWORD in the API environment.'
  }
  return fallback
}

export type InviteSessionUser = Pick<User, 'email' | 'displayName'>

export type InviteAcceptResult = {
  needsManualLogin?: boolean
  loginMessage?: string
}

export function finishInviteAcceptNavigation(
  result: InviteAcceptResult,
  navigate: (path: string, options?: { replace?: boolean }) => void,
  searchParams: URLSearchParams
): void {
  if (result.needsManualLogin) {
    const q = new URLSearchParams(searchParams)
    q.set('registered', '1')
    navigate(`/login?${q.toString()}`, { replace: true })
    return
  }
  navigate('/app/dashboard', { replace: true })
  window.location.reload()
}

/** Full-page logout (Keycloak SSO + app cookies), then return to the invite URL. */
export function redirectToLogoutForInvite(invitePath: string): void {
  const redirectAfter = `${window.location.origin}${invitePath}`
  const base = getOAuthStartUrl('login').replace(/\/auth\/login$/, '/auth/logout')
  window.location.replace(`${base}?redirect=${encodeURIComponent(redirectAfter)}`)
}
