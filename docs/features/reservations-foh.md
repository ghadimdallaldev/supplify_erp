# Reservations (FOH) — board, availability & alerts

Restaurant front-of-house: floor plan, day board, table assignment, public booking, guest reviews, and team notifications.

## Web routes

| Route                                                                 | Purpose                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `/app/reservations`                                                   | Board, table builder, analytics, reviews inbox, assignments (branch-aware) |
| `/reserve`, `/reserve/:slug`                                          | Guest booking portal                                                       |
| `/reserve/manage/:token`                                              | Guest cancel / reschedule / post-visit review                              |
| `/reserve/waitlist/:token/accept`, `/reserve/waitlist/:token/decline` | Guest waitlist table offer response                                        |
| `/reserve/confirmation`                                               | Post-booking confirmation                                                  |

## API (high level)

| Area          | Endpoints                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Board / CRUD  | `GET/POST/PATCH /api/reservations`, `PATCH /api/reservations/:id/tables`                                |
| Availability  | Shared `reservation-availability.js`; public `GET /api/public/reservations/availability`                |
| Public manage | `POST /api/public/reservations/manage/cancel`, `.../reschedule`, `.../review`                           |
| Reviews       | Staff `GET /api/reservations/reviews`, `POST /api/reservations/reviews/:id/reply`; public manage review |
| Blackouts     | `GET/POST /api/reservations/blackouts`, `DELETE /api/reservations/blackouts/:id`                        |
| Waitlist      | See [waitlist-auto-promotion.md](./waitlist-auto-promotion.md)                                          |

Migration `0103_reservation_availability_indexes.sql` supports slot/overlap queries. Migration `0198_reservation_excellence.sql` adds `NO_SHOW`, guest CRM-lite, blackouts, reminder markers, and reservation-linked reviews.

Guest cancel enforces `_booking.cancelWindowHours` via `reservation-policy.js`. Public book requires `depositAcknowledged` when deposit mode is `fixed` or `percent`.

## Lifecycle extras (0198+)

- Statuses include **NO_SHOW** (host board actions + analytics `no_shows`).
- Booking fields: `occasion`, `allergies`, `booking_source` (`staff` / `public` / `walk_in`), optional `guest_id`.
- `reservation_guest` persists VIP/allergies/visit & no-show counts.
- Public booking settings `_booking` meta: party min/max, max covers/slot, cancel window, deposit policy copy.
- Cron `reservation_guest_comms` (15 min): T-24h / T-2h reminders + post-complete review invites (email + WhatsApp).

## Table assignment

- Staff assign tables from the board (**Assign table** / dropdown on reservation card).
- `PATCH /api/reservations/:id/tables` persists `reservation_table` links.
- Floor plan (`ReservationTableBuilder`) shows guest name on assigned tables until reservation is **COMPLETED** or **CANCELLED**.

## Board & timezone

- Day filter uses local calendar date (`reservation-board-date.js`) so “today” matches the restaurant timezone.
- Drag-and-drop status changes use a drag handle only (clicks on selects/buttons are not swallowed).

## Notifications (restaurant team)

| Event                      | Recipients                                 |
| -------------------------- | ------------------------------------------ |
| New booking (public/board) | All restaurant users (`notifyTenantUsers`) |
| Waitlist                   | Restaurant team                            |
| Guest cancel / reschedule  | `notifyReservationStaffEvent`              |
| Staff status change        | Restaurant team                            |

## Guest notifications (email + WhatsApp)

Direct sends via `notifyGuestReservationConfirmation` and `notifyGuestReservationUpdate` in `notification/email.js` (bypass tenant prefs; require guest email and/or phone). Reminders / review invites via `jobs/reservation-guest-comms.job.js`.

| Event                         | Recipient | Templates / notes                                  |
| ----------------------------- | --------- | -------------------------------------------------- |
| Confirmed / waitlisted        | Guest     | `reservation.confirmation`, `reservation.waitlist` |
| Cancelled by restaurant staff | Guest     | `reservation.cancelled`                            |
| Rescheduled by restaurant     | Guest     | `reservation.rescheduled`                          |
| Reminder T-24h / T-2h         | Guest     | `reservation.reminder`                             |
| Review invite                 | Guest     | `reservation.review_invite`                        |
| Guest self-cancel             | —         | Staff notified only (guest already knows)          |
| Waitlist table offer          | Guest     | `reservation.waitlist_offer` (+ WhatsApp)          |

Foreground alerts: `useNotificationAlerts` in `Layout` (toast ~10s, sound, browser notification when permitted).

## Related docs

- [waitlist-auto-promotion.md](./waitlist-auto-promotion.md)
- [restaurant-reviews.md](./restaurant-reviews.md) — shared rating summary includes reservation reviews
- [features.md](../product/features.md) — Reservations section
- [regression-checklist.md](../qa/regression-checklist.md) — Part 5 (PUB-\*), §6.8 (RST-35+, RST-42a–c), waitlist offers (PUB-14–16)

## Tests

- API: `reservations.routes.test.js`, `public.routes.test.js`, `reservation-availability.test.js`, `waitlistPromotion.test.js`, `supplier-last-order.test.js` (related supplier cutoff)
- Web: `ReservationsPage.test.tsx`, `PublicReservationWaitlistOffer.test.tsx`, `reservation-tables.test.ts`
