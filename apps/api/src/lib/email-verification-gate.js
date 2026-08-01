/**
 * When email OTP is enabled, sessions must carry email_verified=true from Keycloak
 * before we mint app cookies or allow registration completion.
 */
export function mustBlockUnverifiedEmail({ otpEnabled, emailVerified }) {
  return Boolean(otpEnabled) && emailVerified !== true
}
