# Email OTP authentication: current-state audit

## Baseline

Supplify uses Keycloak 24 for human OIDC browser login. The web app redirects to
`GET /auth/login`; Keycloak hosts the password and registration pages; the API
handles the authorization-code callback and sets HttpOnly access and refresh
cookies. Access cookies are aligned to the 20-minute Keycloak access-token
lifespan, refresh tokens rotate, SSO idle is seven days, SSO maximum is 30 days,
and Remember Me is disabled.

The current refresh paths are `POST /auth/refresh`,
`POST /auth/mobile/refresh`, and the cookie refresh inside `requireAuth`.
They must never invoke OTP. The web proactive scheduler in
`apps/web/src/lib/authSessionRefresh.ts` continues to use `/auth/me` metadata
and is intentionally unchanged.

## Findings

| Area         | Current state                                                                                                                          | OTP impact                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Keycloak     | Realm exports exist for `Supplify`, `supplify-preprod`, and `supplify-prod`; session policy is applied separately for existing realms. | Add the provider to the image and apply browser/registration flow bindings independently.                                 |
| Login        | React redirect → Keycloak hosted login → API callback → cookies.                                                                       | Add the login authenticator after username/password. The code is issued only after OTP succeeds.                          |
| Registration | Keycloak registration → callback → `PENDING` user → `/api/register/complete`.                                                          | Add the email verification required action and reject tenant completion when the token is not email verified.             |
| Direct grant | Dev keeps the invite/test exception; preprod/prod clients disable direct access grants.                                                | No production OTP bypass. Dev direct-grant behavior is documented as a test exception.                                    |
| Identity     | `normalizeIdentityEmail` and case-insensitive uniqueness are established; `is_active` is enforced during user lookup.                  | Normalize all OTP delivery and Keycloak lookups; inactive users remain rejected even after OTP.                           |
| Email        | Nodemailer/SMTP and `sendTemplateEmail` already provide delivery logging and idempotency.                                              | Add two localized templates and an authenticated internal delivery endpoint.                                              |
| OTP          | Not implemented.                                                                                                                       | Store only HMAC-SHA256 in the Keycloak authentication session; enforce expiry, attempts, resend cooldown, and single use. |

## Security boundaries

OTP is required for interactive browser login and signup email verification. It
is not required on refresh, proactive refresh, `requireAuth` silent renewal,
service accounts, M2M, B2C consumer JWTs, or staff magic links. Existing verified
users gain login OTP without being bulk-marked unverified. Existing sessions are
left valid until expiry or logout.

Related session and identity hardening references:

- [Auth session architecture](auth-session-architecture-current-state.md)
- [Auth session management](../features/auth-session-management.md)
- [Auth session hardening report](../reports/auth-session-hardening-implementation-report.md)
- [Auth session troubleshooting](../runbooks/auth-session-troubleshooting.md)
- [Identity normalizer](../../apps/api/src/lib/identity-normalize.js)
