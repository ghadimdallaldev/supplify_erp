# Email OTP troubleshooting

1. Confirm the Keycloak provider is present under `/opt/keycloak/providers/`
   and that the image was rebuilt with `kc.sh build`.
2. Confirm `AUTH_EMAIL_OTP_ENABLED`, `AUTH_EMAIL_OTP_INTERNAL_SECRET`, and the
   Keycloak `SUPPLIFY_OTP_MAIL_URL`/`SUPPLIFY_OTP_MAIL_SECRET` agree.
3. Check the API's SMTP configuration and `email_delivery_log`; search by the
   event key, never by an OTP value.
4. Check Redis connectivity and the OTP limiter counters before increasing any
   limits.
5. For lost-email recovery, an administrator must verify identity out of band,
   make a temporary audited required-action change, and notify the account's
   existing email. Do not clear verification broadly.
6. After changing OTP flows, re-run
   `node deploy/keycloak/apply-email-otp-flows.mjs` and confirm the browser
   flow's forms subflow contains both `auth-username-password-form` and
   `email-otp-login` (not an empty nested flow). If Sign In jumps straight to
   "We are sorry... Invalid username or password" with no login form, the
   browser flow likely has Cookie/IDP DISABLED or the forms subflow unbound —
   re-run the apply script (it re-enables steps and re-links orphaned forms).
7. If Create account or post-OTP recovery shows Keycloak's
   **"Do you want to log out?"** page, the API must pass `id_token_hint` on the
   end-session URL (stored as the `id_token` cookie after a successful login).
   Confirm the API deploy includes that cookie and that logout URLs include
   `id_token_hint`. Without the hint, Keycloak always confirms when an SSO
   cookie is present.
8. If you see **"We are sorry... Invalid username or password"** on
   `login-actions/authenticate` (not the red error on the login form), the
   email-OTP authenticator likely aborted the flow (`context.failure`). That
   was fixed to re-show the login form instead; redeploy Keycloak so the
   provider JAR updates. Also clear Keycloak cookies / use a private window
   in case the auth session tab is stale.

Refresh failures do not imply an OTP failure. Follow the
[auth-session troubleshooting runbook](auth-session-troubleshooting.md) for
transient 503s, refresh rotation, and session expiry.

## Manual smoke checklist

1. **Signup**: Create account → Keycloak OTP page appears → enter emailed code →
   land on `/register/complete` → accept legal docs → `/app/activate` → app.
2. **Login** (verified user): Sign in → password → Keycloak OTP page → enter
   code → land on `/app` (or `/register/complete` if setup incomplete).
3. **Abandoned signup recovery**: If OTP was skipped somehow, callback clears
   Keycloak SSO and re-enters `/auth/login` so password + signup OTP required
   action run again (single `signup_email_verification` code, not dual purposes).
