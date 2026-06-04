# Twilio integration (WhatsApp + Email)

Supplify uses **Twilio** for outbound **WhatsApp** and **transactional email** (via **Twilio SendGrid**).

## WhatsApp

Set in `apps/api/.env`:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

- `TWILIO_WHATSAPP_FROM` can be `whatsapp:+E164` or bare `+E164`.
- Recipients are normalized to `whatsapp:+E164` automatically.
- Used by `notification.service.js` when the tenant plan includes WhatsApp (`email_and_whatsapp`, etc.) and user prefs allow it.
- **Sandbox:** join the Twilio WhatsApp sandbox and use approved test numbers until your business profile is live.
- **Production:** use approved WhatsApp templates for business-initiated messages outside the 24-hour session window.

## Email (Twilio SendGrid)

Preferred provider when `SENDGRID_API_KEY` is set (create in [Twilio Console → Email](https://console.twilio.com) or SendGrid dashboard):

```env
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=Supplify
```

Used for:

- Order and system notifications
- Staff portal magic links
- Other `sendMail()` callers

## SMTP fallback

If `SENDGRID_API_KEY` is unset, the API falls back to **SMTP** (`SMTP_HOST`, etc.). You can use SendGrid SMTP with `SMTP_USER=apikey` and `SMTP_PASS=<SendGrid API key>`.

## Production checklist

1. Verify sender domain in SendGrid (link from Twilio Email).
2. Connect WhatsApp Business sender in Twilio Messaging.
3. Set env vars on the API service (see `apps/api/.env.example`).
4. Ensure plans use `email_and_whatsapp` (or higher) for WhatsApp channel.
5. `validateProductionConfig()` requires **either** `SENDGRID_API_KEY` or `SMTP_HOST`.

## Code map

| File                                            | Role                                   |
| ----------------------------------------------- | -------------------------------------- |
| `apps/api/src/lib/twilio-client.js`             | Twilio SDK client + address formatting |
| `apps/api/src/services/whatsapp.service.js`     | Send WhatsApp messages                 |
| `apps/api/src/services/mailer.service.js`       | SendGrid + SMTP email                  |
| `apps/api/src/services/notification.service.js` | Routes notifications to both channels  |
