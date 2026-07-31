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

Refresh failures do not imply an OTP failure. Follow the
[auth-session troubleshooting runbook](auth-session-troubleshooting.md) for
transient 503s, refresh rotation, and session expiry.
