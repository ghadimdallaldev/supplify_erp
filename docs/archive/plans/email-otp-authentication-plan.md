# Email OTP authentication implementation plan

## Chosen architecture

Keep the existing React → Keycloak OIDC redirect. A Keycloak 24 provider adds
`email-otp-login` to the browser flow after password authentication and
`email-otp-verify-email` as the registration/unverified-user required action.
The provider generates a six-digit code with `SecureRandom`, stores only its
HMAC-SHA256 digest in the authentication session, and calls the API's internal
SMTP delivery endpoint. The authorization code and Supplify cookies are issued
only after the browser flow succeeds.

Defaults are a 600-second TTL, five attempts, and a 60-second resend cooldown.
Resends invalidate the previous digest. API delivery is authenticated with a
shared secret, rate limited in Redis, and recorded through the existing
`email_delivery_log` idempotency path. OTP values never appear in logs or audit
metadata.

## Compatibility requirements

- Preserve 20-minute access cookies, 30-day refresh cookies, rotation, and
  proactive web refresh.
- Never call OTP APIs from `/auth/refresh`, `/auth/mobile/refresh`, or
  `requireAuth` refresh handling.
- Normalize email using the same lower/trim rule as the API identity layer.
- Keep direct grants disabled in preprod/prod; any dev invite auto-login remains
  an explicit exception and is not a realistic OTP test.
- Keep inactive-account callback and lookup rejection behavior.

## Rollout

1. Build and copy the provider into Keycloak, then run `kc.sh build`.
2. Import new realm exports or run `apply-email-otp-flows.mjs` on existing realms.
3. Configure `AUTH_EMAIL_OTP_*`, `AUTH_EMAIL_OTP_INTERNAL_SECRET`, and the
   provider's API URL/secret in the Keycloak runtime.
4. Verify SMTP/Mailpit delivery, login OTP, registration verification, refresh,
   inactive users, rate limits, and audit redaction.
5. Roll back by disabling the feature flag and applying the flow rollback. Do
   not bulk-change existing email verification or active status.
