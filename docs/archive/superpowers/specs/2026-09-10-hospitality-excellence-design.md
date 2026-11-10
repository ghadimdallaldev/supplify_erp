# Hospitality excellence — reservations, supplier cutoffs, menus — 2026-09-10

## Goal

Make restaurant reservations a complete, best-in-class FOH product; add supplier last-order / delivery-day rules; elevate guest and staff menus to world-class quality. **Reservations (including post-visit reviews) are the highest priority.**

## Locked decisions

| Decision          | Choice                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Delivery approach | Phased: (1) reservations + reviews, (2) supplier last-order, (3) guest + staff menus                                              |
| Phase 1 focus     | Ops-complete host stand + public booking polish + reservation reviews                                                             |
| Reviews UX        | Tokenized post-visit review (email/WhatsApp), same rating dimensions & restaurant summary as consumer orders, staff inbox + reply |
| Deposits          | Policy + amount/% + cancel window first; card hold via existing billing gateway when configured — never fake “paid”               |
| Mobile            | Web + public portal first; document skip/parity in `MOBILE_FEATURE_PARITY.md` until native host/guest surfaces exist              |

## Phase 1 — Reservations excellence

### Capabilities

1. **Lifecycle:** `NO_SHOW` status; status change audit markers; occasion, allergies, staff notes, booking source (`staff` / `public` / `walk_in`).
2. **Guest CRM-lite:** `reservation_guest` keyed by restaurant + normalized phone/email; VIP/tags/allergies/notes; visit & no-show counters.
3. **Capacity:** Per-day hours (not only uniform), blackout dates, min/max party, turn-time by party size, max covers per slot; table-aware assignment remains.
4. **Revenue protection:** Deposit policy in booking settings (none / fixed / percent), cancellation window hours, public policy copy.
5. **Comms:** Cron T-24h and T-2h reminders (email + WhatsApp); post-`COMPLETED` review invite; existing confirmation/cancel/reschedule/waitlist kept.
6. **Host UX:** Board supports NO_SHOW; reviews inbox; guest intelligence uses `reservation_guest`; combine-tables assist retained/improved.
7. **Public booking:** Occasion + allergies fields; deposit acknowledgment when required; ratings summary on portal; manage-token review page.
8. **Reviews:** `restaurant_reviews.reservation_id` (unique); eligible when reservation `COMPLETED`; one review per reservation; staff reply fields; board inbox API.
9. **Analytics:** No-show counts, source mix, reservation-channel review averages.

### Data

- Migration `0198_reservation_excellence.sql` (and follow-ups as needed).
- Booking policy meta lives in `restaurant.operating_hours._booking` (extend existing pattern) plus `reservation_blackout` table.
- Reviews reuse `restaurant_reviews` / `restaurant_rating_summaries` triggers.

### APIs (delta)

- Staff: expand public-booking-settings; blackouts CRUD; guest search; list reservation reviews + reply; mark NO_SHOW.
- Public: book with occasion/allergies; `GET/POST` review by manage token; portal rating summary.
- Cron: reservation reminders + review invites.

### Explicit Phase 1 deferrals

Google Reserve / marketplace syndication, SMS carrier, native host iPad app, full SevenRooms CRM, dynamic pricing / ticketed experiences.

## Phase 2 — Supplier last-order time

### Behavior

Supplier setting:

- **Mode `none`:** Restaurant may place orders for the next delivery day anytime (no cutoff).
- **Mode `cutoff`:** If order is not placed before the cutoff (e.g. “last 30 minutes before delivery window” or absolute clock time), requested delivery shifts to tomorrow, day-after, or a supplier-configured lead period (`lead_days` / `delivery_offset_days`).

### Implementation sketch

- Persist on supplier business settings (extend `0177` / `supplier-business-settings.js`): `lastOrderMode`, `cutoffType` (`absolute_time` | `minutes_before_window`), `cutoffTime` / `cutoffMinutes`, `rolloverOffsetDays`, timezone.
- Enforce in restaurant order create; surface next eligible delivery date in cart; wire cart `deliveryDate` through `orderCreateSchema` (today it is dropped).
- Restaurant UX: countdown / “orders after X go to Y” on cart and catalog.

## Phase 3 — Guest + staff menus

### Guest menu

QR/table deep links, allergens + dietary filters, card/wallet when gateway live, upsells/combos, richer storefront, menu analytics.

### Staff menu

Kitchen 86 controls, station-aware tickets / stronger KDS, server handheld order entry against shared catalog, optional staff-only price lists — distinct from HR `/app/staff`.

## Testing & docs

- API + web tests for NO_SHOW, reviews by token, booking policy, supplier cutoff enforcement.
- Update `docs/features/reservations-foh.md`, new review section or `reservation-reviews.md`, supplier business settings / order create docs, consumer/staff menu docs as shipped.
- Always add dated `docs/mobile/MOBILE_FEATURE_PARITY.md` entries.

## Success criteria (full goal)

1. Reservations: no critical ops gaps vs OpenTable/Resy for board + public book + reviews + no-shows + reminders + policies.
2. Supplier last-order: configurable none vs cutoff with rollover period; enforced and visible in cart.
3. Guest menu and staff/kitchen menu demonstrably above “basic CMS + kanban” — competitive feature set verified in docs + UI.
4. Parity log + domain docs current; typecheck/tests green for changed surfaces.
