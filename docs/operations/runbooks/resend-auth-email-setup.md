# Auth email setup

Configure the existing Nodemailer transport with `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM_ADDRESS`. Resend is supported through
its SMTP endpoint; no provider SDK is required. `EMAIL_FROM_AUTH` may override
the sender for authentication mail. Mailpit can be used locally on port 1025.

Set `AUTH_EMAIL_OTP_INTERNAL_SECRET` on the API and the matching
`SUPPLIFY_OTP_MAIL_SECRET` on Keycloak. Keep the secret out of logs and do not
put a fixed test code in a production image.

## Keycloak recovery and verification links

The bundled `HttpEmailSenderProviderFactory` overrides the default email sender
when `SUPPLIFY_OTP_MAIL_URL` is configured. It derives the authenticated
`/api/internal/auth/keycloak/email` route from that existing OTP URL and reuses
`SUPPLIFY_OTP_MAIL_SECRET`. No new environment key or client contract is needed.
Install the API relay before the updated Keycloak image. Without an OTP mail
URL the adapter keeps native SMTP behavior.

The API validates the envelope, hashes it for idempotency, marks the body
sensitive (no stored retry payload), and audits only a redacted recipient and
provider. Keycloak retains responsibility for rendering, expiration and token
validation. Recoveries must fail if delivery is suppressed or unavailable.
SMTP settings alone do not fix Railway's blocked SMTP connection: use the
application's `EMAIL_PROVIDER=resend` HTTPS transport.

Validate in preproduction with an owned, unprivileged temporary account, then
repeat the approved production test. Remove the account afterward and never
copy recovery links or shared secrets into release evidence.
