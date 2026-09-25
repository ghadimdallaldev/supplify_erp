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

Guest cancel enforces `_booking.cancelWindowHours` via `reservation-policy.js`. Public book requires `depositAcknowledged` when a fixed amount or a percent above zero is configured. A zero deposit does not ask the guest to accept a charge. The public availability response includes `depositRequired`, the amount, and the percent, and the booking page shows that amount only when a deposit is actually required. The checkbox confirms the policy and is not a payment. Booking settings cannot set a minimum party larger than the maximum. A party outside that range, or a time when the restaurant is closed, gets that reason instead of “this time was just booked.”

## Lifecycle extras (0198+)

- Statuses include **NO_SHOW** (host board actions + analytics `no_shows`).
- A **COMPLETED** visit cannot change status, so visit counts are not incremented twice. **CANCELLED** and **NO_SHOW** can be restored to confirmed or pending only when that table and the remaining seats are still free. Restoring a no-show removes that no-show from the guest’s count. Guest emails, waitlist promotion, and visit/no-show counts run only when the status actually changes. The host who created the booking is stored as the app user.
- Booking fields: `occasion`, `allergies`, `booking_source` (`staff` / `public` / `walk_in`), optional `guest_id`.
- `reservation_guest` persists VIP/allergies/visit & no-show counts. Guest intelligence counts a visit only when the reservation is completed. A no-show or a booking that has not happened yet is not a visit, and a guest with only no-shows is not marked VIP. An upcoming pending or confirmed booking still appears as a follow-up.
- Public booking settings `_booking` meta: party min/max, max covers/slot, cancel window, deposit policy copy.
- Cron `reservation_guest_comms` (15 min): T-24h / T-2h reminders + post-complete review invites (email + WhatsApp). A reminder or review invite is sent only if the booking is still pending, confirmed, or completed when the message is claimed.

## Table assignment

- Staff assign tables from the board (**Assign table** / dropdown on reservation card). The chosen tables must seat the party, and a table already held by another live reservation at that time cannot be assigned again. Creating a reservation does the same: it will not confirm a party the free tables cannot seat, and it will not book a time that has already passed. When the host does not pick a table, the booking uses one free table that fits the party before it combines smaller tables. A party with a table is confirmed while the room is under 90% full and held as pending after that. They are waitlisted only when no table fits. The host booking form opens on the computer’s local clock and starts from the restaurant’s seating duration, and a rejected booking shows the server’s reason. The board’s day is the restaurant’s local calendar day, so a booking after midnight stays on that day instead of the previous UTC date. Guest time slots use that same timezone, so a 7:00 p.m. opening is 7:00 p.m. at the restaurant. Guest booking and reschedule dates use the same local calendar day. Public bookings and accepted waitlist offers use the restaurant’s seating duration, not a shorter time sent by the guest, and both hold a free table instead of confirming with none assigned. Moving a booking online takes a free table at the new time and does not keep a table that is already held then. A blackout date blocks online booking and a new host booking for that restaurant, or for that branch when the blackout is branch-specific. The same guest cannot hold two overlapping reservations, including when they move an existing booking or accept a waitlist offer, and a seated, completed, or cancelled reservation cannot be moved online. Accepting a waitlist offer locks the restaurant and rechecks that the time is still open. A guest can cancel only a pending, confirmed, or waitlisted booking, and only while it still has that status. A booking that ends when the next one starts does not count as an overlap.
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
