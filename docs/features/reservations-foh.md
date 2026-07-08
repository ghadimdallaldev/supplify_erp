# Reservations (FOH) — board, availability & alerts

Restaurant front-of-house: floor plan, day board, table assignment, public booking, and team notifications.

## Web routes

| Route                                                                 | Purpose                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/app/reservations`                                                   | Board, table builder, analytics, assignments (branch-aware when multi-branch) |
| `/reserve`, `/reserve/:slug`                                          | Guest booking portal                                                          |
| `/reserve/manage/:token`                                              | Guest cancel / reschedule                                                     |
| `/reserve/waitlist/:token/accept`, `/reserve/waitlist/:token/decline` | Guest waitlist table offer response                                           |
| `/reserve/confirmation`                                               | Post-booking confirmation                                                     |

## API (high level)

| Area          | Endpoints                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Board / CRUD  | `GET/POST/PATCH /api/reservations`, `PATCH /api/reservations/:id/tables`                                 |
| Availability  | Shared `reservation-availability.js`; public `GET /api/public/reservations/availability`                 |
| Public manage | `POST /api/public/reservations/manage/cancel`, `.../reschedule` (parity with staff cancel notifications) |
| Waitlist      | See [waitlist-auto-promotion.md](./waitlist-auto-promotion.md)                                           |

Migration `0103_reservation_availability_indexes.sql` supports slot/overlap queries.

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

Direct sends via `notifyGuestReservationConfirmation` and `notifyGuestReservationUpdate` in `notification/email.js` (bypass tenant prefs; require guest email and/or phone).

| Event                         | Recipient | Templates / notes                                            |
| ----------------------------- | --------- | ------------------------------------------------------------ |
| Confirmed / waitlisted        | Guest     | `reservation.confirmation`, `reservation.waitlist`           |
| Cancelled by restaurant staff | Guest     | `reservation.cancelled`                                      |
| Rescheduled by restaurant     | Guest     | `reservation.rescheduled`                                    |
| Guest self-cancel             | —         | Staff notified only (guest already knows)                    |
| Waitlist table offer          | Guest     | `reservation.waitlist_offer` (+ WhatsApp) — see waitlist doc |

Foreground alerts: `useNotificationAlerts` in `Layout` (toast ~10s, sound, browser notification when permitted).

## Related docs

- [waitlist-auto-promotion.md](./waitlist-auto-promotion.md)
- [features.md](../product/features.md) — Reservations section
- [regression-checklist.md](../qa/regression-checklist.md) — Part 5 (PUB-\*), §6.8 (RST-35+, RST-42a–c), waitlist offers (PUB-14–16)

## Tests

- API: `reservations.routes.test.js`, `public.routes.test.js`, `reservation-availability.test.js`, `waitlistPromotion.test.js`
- Web: `ReservationsPage.test.tsx`, `PublicReservationWaitlistOffer.test.tsx`, `reservation-tables.test.ts`
