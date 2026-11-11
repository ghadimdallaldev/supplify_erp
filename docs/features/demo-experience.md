# Public Supplify demo

Updated 2026-11-11. The HORECA experience ships with the existing Supplify web and API services in every environment. It does not require a separate Railway app, database or domain.

| Environment                   | Public URL                                |
| ----------------------------- | ----------------------------------------- |
| Dev                           | https://app-dev.supplifyerp.com/demo/     |
| Preprod                       | https://app-preprod.supplifyerp.com/demo/ |
| Production / printed QR codes | https://app.supplifyerp.com/demo/         |

`/demo` and `/horeca` redirect to `/demo/`, preserving query parameters. Anonymous visitors can watch the captioned video and try both seven-step sample walkthroughs without signing in. Existing restaurant/consumer checkout and staff/driver paths are unaffected.

## Application structure

- `apps/web/demo/index.html` and `apps/web/src/demo/` form a second HTML entry in the existing Vite build. The campaign uses the same installed React runtime while keeping its CSS and initialization out of the ERP shell.
- `apps/web/static/demo/` holds video, captions, real sample screenshots, self-hosted fonts and production QR assets. Nginx serves video range requests directly; media does not pass through the API.
- `apps/api/src/routes/demo-campaign.routes.js` handles campaign requests in the main API. Migration `0231_demo_campaign.sql` adds platform-owned `demo_campaign_lead` and `demo_campaign_event` tables to each environment's existing database.
- `apps/horeca-experience/` is a retired, ignored local authoring archive. Its old Next server, database configuration and standalone admin password are not deployed.

## Public API

| Method | Route                     | Purpose                                                               |
| ------ | ------------------------- | --------------------------------------------------------------------- |
| POST   | `/api/public/demo/leads`  | Validate a consented demo request and deduplicate by normalized phone |
| POST   | `/api/public/demo/events` | Record an allowed anonymous per-tab funnel event                      |

Lead payloads include name, company, restaurant/supplier role, WhatsApp number, optional email, a role-specific size band, consent and optional QR/UTM attribution. A filled honeypot returns success without storage. New and duplicate requests return the same `{ok:true}` result and never disclose existing lead information. These requests do not create ERP users, tenants or orders.

The frontend deliberately omits ERP authentication cookies on campaign submissions. Public requests use their own rate limits (20 lead attempts per 10 minutes and 180 events per minute per IP), backed by the API's existing Redis rate-limit store when available. Existing global API protections still apply. Events store no IP address, user agent, auth token or tenant ID. Failed analytics never block the walkthrough.

## Campaign administration

Open `/demo/admin/` after signing in to Supplify with an admin account. All campaign administration routes inherit `requireAuth`, the ADMIN role, existing admin context, and `ADMIN_GROWTH` authorization:

| Method | Route                                  |
| ------ | -------------------------------------- |
| GET    | `/api/admin-dashboard/demo/leads`      |
| GET    | `/api/admin-dashboard/demo/summary`    |
| PATCH  | `/api/admin-dashboard/demo/leads/:id`  |
| GET    | `/api/admin-dashboard/demo/export.csv` |

Lists show the latest 500 leads; CSV exports contain at most 10,000 rows and neutralize spreadsheet formulas. Status and notes are editable; no anonymous caller can read or modify lead data. Admin responses are not cached. Requests are available for manual follow-up; no meeting is automatically booked and this integration does not send new notification emails.

## Mobile parity

Android and iOS include matching campaign request/event types and anonymous API helpers. The public presentation remains a web experience opened by HTTPS/QR; no operational native screen or auth flow changes. The admin interface remains web-only under existing admin permissions. No new feature key, permission key or required environment variable is introduced.

## Verification and QR assets

Run `pnpm typecheck`, focused campaign API/permission tests, the web build, and `pnpm test:demo` against its preview. `DEMO_BASE_URL` can point the browser checks at an environment. Do not use a live environment for mocked-form tests when verifying actual persistence; check API readiness and migration completion independently.

Generate production QR files with `python scripts/horeca/qr/generate.py --base-url https://app.supplifyerp.com/demo`, then decode them with `python scripts/horeca/qr/verify.py`. They are published under `/demo/qr/`. QR variants retain source/role attribution. Verify production `/demo/`, video playback, both walkthroughs and API readiness before printing or sharing the QR code.

Release the full source through `dev → preprod → prod`. API startup applies the new migration through the existing migration mechanism; the web and API must both reach the same release before checking lead submission.
