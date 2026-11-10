# Auth email setup

Configure the existing Nodemailer transport with `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM_ADDRESS`. Resend is supported through
its SMTP endpoint; no provider SDK is required. `EMAIL_FROM_AUTH` may override
the sender for authentication mail. Mailpit can be used locally on port 1025.

Set `AUTH_EMAIL_OTP_INTERNAL_SECRET` on the API and the matching
`SUPPLIFY_OTP_MAIL_SECRET` on Keycloak. Keep the secret out of logs and do not
put a fixed test code in a production image.
