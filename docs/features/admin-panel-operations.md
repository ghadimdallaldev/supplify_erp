# Admin operations visibility

Platform admins can monitor recently shipped operational features from the **Operations** tab on `/app/admin`, plus lightweight counters on **Overview** and email failures on **Health**.

## What is monitored

| Area                | Metrics / views                                                                                            | Read-only |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| Email               | Enabled/log-only, provider configured (no secrets), delivery log (redacted recipients), 24h failure counts | Yes       |
| Expiry inventory    | Restaurants with lots, expiring/expired counts, reminders today                                            | Yes       |
| Reorder cadence     | Active patterns, reminders sent today                                                                      | Yes       |
| Fulfillment issues  | Open shortage/substitution issues, chat-linked count                                                       | Yes       |
| Quick lists         | Totals, scheduled, branch-scoped usage                                                                     | Yes       |
| GPS / delivery      | Platform GPS flags, live/stale/no GPS/failed counts, active delivery list (no map/history)                 | Yes       |
| Restaurant tracking | Platform allow flag, privacy (name/phone visible)                                                          | Yes       |
| Subscriptions       | Expired trials, trials ending soon, write-blocked tenants                                                  | Yes       |
| Deals               | Pending review/payment counts (links to Deals tab)                                                         | Yes       |

## API endpoints (admin only)

All under `/api/admin-dashboard`, guarded by `ADMIN` role + granular admin permissions.

- `GET /operational-summary`
- `GET /operational/email-logs`
- `GET /operational/fulfillment-issues`
- `GET /operational/active-deliveries`
- `GET /tenants/:tenantType/:id/operational-snapshot`
- `GET /health` — includes `emailFailures` (24h, redacted)

See [admin_endpoints.md](../blueprint/admin/admin_endpoints.md).

## Warnings

Server-computed warnings (max 15) include examples:

- Email enabled without provider
- High failed email rate (24h)
- Restaurant tracking allowed but platform GPS off
- Many stale GPS deliveries
- Suppliers with deliveries but no drivers
- Many open fulfillment issues / expired lots
- Pending deals needing review

## Tenant diagnostics

**Tenants** tab → **Diagnostics** per row, or **Operations** → tenant picker.

Loads operational snapshot + entitlements + usage meters. Links to Limits / Features tabs for changes.

## What admins can still act on elsewhere

- Deals: approve/reject/pause (`AdminDealsPanel`)
- Subscriptions: extend trial, unlock, change plan
- Limits & add-ons: `AdminLimitsTab`
- Feature flags: `AdminFeatureFlagsPanel`
- Impersonation: tenant tables

Operations views do **not** expose SMTP passwords, API keys, full GPS ping history, or bulk driver PII.

## Privacy and security

- Non-admin roles cannot call admin-dashboard operational routes (401).
- Email logs use `redactEmail()` for recipients.
- GPS admin views return state labels only (Live / Stale / No GPS / Off), not coordinate trails.
- Restaurant tracking privacy reflects platform env (`GPS_RESTAURANT_SHOW_DRIVER_*`), not per-tenant surveillance.
