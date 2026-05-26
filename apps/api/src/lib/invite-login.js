import { exchangePasswordForTokens, getUserInfo } from './auth.js'
import { setAuthCookies } from './rbac.js'
import { logger } from './logger.js'

/**
 * After invite DB work succeeds, log the new user in via password grant (optional).
 * Never throws — returns needsManualLogin when Keycloak rejects direct access grants.
 */
export async function completeInviteAcceptSession(res, { result, fullName, req }) {
  const sessionUser = req.userData
    ? {
        id: req.userData.id,
        email: req.userData.email,
        displayName: req.userData.display_name,
      }
    : null

  if (!result.needsLogin || !result.password) {
    return { user: sessionUser, needsManualLogin: false }
  }

  try {
    const tokens = await exchangePasswordForTokens(result.email, result.password)
    setAuthCookies(res, tokens.access_token, tokens.refresh_token)
    const userInfo = await getUserInfo(tokens.access_token, tokens.id_token)
    return {
      user: {
        email: userInfo.email || result.email,
        displayName: fullName || userInfo.given_name || result.email,
      },
      needsManualLogin: false,
    }
  } catch (loginErr) {
    const axiosData = loginErr.response?.data
    const detail =
      axiosData?.error_description || axiosData?.error || loginErr.message || 'Login failed'
    logger.warn('Invite accepted but automatic login failed', {
      email: result.email,
      detail,
    })
    return {
      user: {
        email: result.email,
        displayName: fullName || result.email,
      },
      needsManualLogin: true,
      loginMessage: 'Your account was created. Sign in with the email and password you just set.',
    }
  }
}
