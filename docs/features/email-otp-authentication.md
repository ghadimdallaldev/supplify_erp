# Email OTP authentication

Supplify requires a one-time email code on interactive Keycloak browser login.
The password and OTP pages remain hosted by Keycloak; Supplify does not expose
custom password forms. Signup uses the same hosted flow and verifies the email
before tenant activation.

Codes are six digits, expire after ten minutes, allow five attempts, and can be
resent after 60 seconds. A resend invalidates the previous code. Only an HMAC
digest is held by Keycloak, and API logs/audits redact the code.

OTP is not used for access-token refresh, proactive refresh, `requireAuth`
renewal, B2C consumer sessions, service accounts, or staff magic links. The
existing [session management feature](auth-session-management.md) continues to
control cookie lifetimes and refresh rotation.

## Driver login friction

Drivers are the only users with reduced repeated-login friction. When the API sees an active supplier `Driver` tenant role, it writes a server-controlled Keycloak attribute and the login OTP step is skipped for that user. Password login, refresh-token expiry, logout, email verification, and the normal OTP flow for every other user are unchanged. If synchronization fails, the user keeps normal OTP protection.

Configure `AUTH_EMAIL_OTP_DRIVER_BYPASS=true` on Keycloak to enable this behavior; the provider default is true.
