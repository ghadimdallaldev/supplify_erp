# Email OTP implementation report

## Delivered

- Keycloak 24 provider module at deploy/keycloak/providers/email-otp: browser
  login authenticator, signup required action, HMAC-SHA256 auth-session notes,
  single-use/expiry/attempt/cooldown controls, localized accessible theme, and
  Java unit tests.
- Railway and local Docker packaging with provider JAR build/copy and
  Keycloak build; realm exports include the OTP browser flow, custom required
  action, and email theme.
- Idempotent Admin API apply and rollback scripts for existing realms.
- API internal delivery endpoint with shared-secret auth, normalized email,
  dedicated Redis rate limiting, delivery idempotency, audit redaction, SMTP
  templates in English and Arabic, and no OTP retry payload/log preview.
- Human Keycloak creation now defaults to unverified plus the required action.
  Invitation email matching is the explicit email-proof exception. Registration
  completion requires the verified token claim when OTP is enabled.
- Session refresh, mobile refresh, requireAuth renewal, and web proactive
  refresh were left unchanged. Mobile parity documentation records the hosted
  OTP step.

## Verification

Passed:

- API auth routes, auth-session, RBAC, registration, invitation, identity,
  email-template, and internal OTP route tests.
- Web authSessionRefresh tests.
- API ESLint (existing warnings only; no errors).
- JavaScript syntax checks and realm/email JSON parsing.
- git diff --check.

Not run locally:

- Maven/Keycloak provider compilation: Maven is not installed and Docker daemon
  access is unavailable in this workspace. The Dockerfile contains the Maven
  builder stage; run the image build in CI or a Docker-enabled environment.
- Keycloak + Mailpit browser E2E and live-realm flow application require the
  configured infrastructure and secrets.

## Deployment order

1. Configure API SMTP and OTP internal secret.
2. Configure matching Keycloak OTP HMAC/mail settings and build the image.
3. Apply session policy and then email OTP flows to each existing realm.
4. Enable the feature flag, run the Keycloak + Mailpit browser smoke test, and
   verify refresh never calls the OTP endpoint.
