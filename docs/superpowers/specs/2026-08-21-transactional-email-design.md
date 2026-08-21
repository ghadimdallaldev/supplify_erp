# Transactional email redesign — 2026-08-21

## Goal

Replace the generic slate/system-font email shell and sparse high-traffic copy with a Stripe-like, brand-aligned transactional email experience (precise, calm, premium) while keeping the existing registry + i18n pipeline.

## Decisions (locked)

| Decision    | Choice                                                                |
| ----------- | --------------------------------------------------------------------- |
| Scope       | Shared layout redesign + richer EN/AR copy for high-traffic templates |
| Visual tone | Stripe-like: white canvas, violet accent CTA, minimal chrome          |
| Structure   | Light: OTP code hero + optional key/value detail strips               |
| Arabic      | Full polish pass for the same high-traffic set as English             |
| Approach    | Layout-first + opt-in detail strips (not per-family HTML or MJML)     |

## Out of scope

- Chat, staff portal, deals, growth, admin, inventory, digest — inherit new shell only; no copy rewrite
- Keycloak email-OTP FreeMarker themes (API/Resend path owns the polished OTP templates)
- Mobile app changes (server-rendered email; document skip in `docs/mobile/MOBILE_FEATURE_PARITY.md`)
- New email providers, MJML/React Email migration, hosted logo CDN requirement

## Visual shell

Single shared layout in `apps/api/src/services/email/templates/layout.js`.

### Appearance

- Page background: `#f8fafc`
- Content panel: white, max-width ~560px, subtle border or soft shadow (email-safe)
- Brand: violet wordmark **Supplify** / **سبلايفاي** (`#5b21b6`) — not uppercase gray label
- Title: ~24px semibold near-black (`#0f172a`)
- Body: ~16px `#334155`, line-height ~1.6
- Primary CTA: `#7c3aed` background, white label, 12px 24px padding, ~8px radius
- Footer: centered muted text (`#94a3b8`), automated-message wording
- Hidden preheader for inbox preview when `previewText` is provided
- Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
- RTL: preserve `dir` / `lang` from locale; mirror text-align; keep CTA inline-block friendly

### Compatibility

Prefer table-based outer structure where needed for Outlook; all critical styles remain inline. No reliance on external CSS, web fonts, or background images.

## Content structure

### OTP hero (`auth.email_otp_login`, `auth.email_otp_verify`)

- Large centered code in a soft violet-tint box (`#ede9fe` / brand-pale)
- Generous letter-spacing; tabular/monospace-friendly font in the stack
- Short expiry line under the code
- Reassurance line (“If you didn’t request this…”)
- No CTA button (the code is the action)
- Plain-text alternative still includes the code clearly

### Detail strip (optional)

Helper renders 2–3 key/value rows when data is present. Omit the strip entirely if no rows resolve. Never show empty labels.

| Family   | Rows (when present)           |
| -------- | ----------------------------- |
| Orders   | Order # · Status · Total      |
| Invoices | Invoice # · Amount · Due date |
| Billing  | Plan · Status / renewal hint  |
| Invites  | Team · Role                   |

Registry maps existing payload fields (`orderId`, `invoiceNumber`, amounts, plan names, tenant/role) into strip rows. Callers are not required to change; missing fields simply omit rows.

### High-traffic copy rewrite (EN + AR)

Rewrite subjects, titles, and default messages for:

**Auth:** `welcome`, `team_invite`, `email_otp_login`, `email_otp_verify`, `password_changed`  
**Orders:** `placed`, `shipped`, `delivered`, `cancelled` (subjects/titles + defaults; other order statuses keep current strings but inherit shell)  
**Invoices:** `issued`, `overdue`  
**Billing:** `trial_started`, `trial_ending`, `trial_expired`, `activated`, `payment_failed`

Voice: direct, calm, premium — product UI copy, not marketing. Prefer specific subjects when IDs exist (e.g. order number in subject); graceful fallbacks when not.

Add i18n keys for strip labels (Order, Status, Total, Invoice, Amount, Due, Plan, Team, Role, expiry/reassurance strings) in both `en/emails.json` and `ar/emails.json`.

## Architecture

```
sendTemplateEmail / notification path
  → renderTemplate(templateId, data, locale)   [registry.js]
      → standardTemplate / specialized OTP path
          → renderEmailLayout({ title, bodyHtml, cta, details?, code?, previewText, locale })
              → renderOtpCode(code) | renderDetailStrip(rows)
  → i18n via emails.json (en + ar)
```

### Files to change

| File                                                | Change                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `apps/api/src/services/email/templates/layout.js`   | Stripe shell; `renderOtpCode`; `renderDetailStrip`; preheader |
| `apps/api/src/services/email/templates/registry.js` | Wire OTP hero + detail strips for high-traffic IDs            |
| `apps/api/src/i18n/locales/en/emails.json`          | Copy + strip labels                                           |
| `apps/api/src/i18n/locales/ar/emails.json`          | Matching Arabic polish                                        |
| `apps/api/src/services/email/templates/*.test.js`   | OTP HTML, strip omit-empty, RTL dir, key coverage             |
| `docs/mobile/MOBILE_FEATURE_PARITY.md`              | Dated skip — email is API-only                                |
| `docs/operations/email-system.md`                   | Brief note on layout/helpers if behavior is documented        |

Caller changes in `notification/templates.js` only if a useful field is already computed but not passed through to email data; no broad rewrite.

## Success criteria

1. OTP emails show a prominent code hero; no generic “paste this in a paragraph” only.
2. Invite / order / invoice / billing emails use violet CTA and optional detail strip when data exists.
3. EN and AR high-traffic copy no longer reads as placeholder/generic.
4. Layout remains RTL-safe (`dir="rtl"` for Arabic).
5. Existing email unit tests pass; new cases cover OTP, strip omission, and brand CTA color.
6. Mobile parity skip documented.

## Non-goals reminder

Do not introduce MJML, React Email, or per-family full HTML duplication in this pass.
