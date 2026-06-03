# Waitlist Auto-Promotion

When a reservation is **cancelled**, the system automatically offers the next matching waitlist guest a table.

**Plan gate:** `waitlist_auto_promo` — **Gold+** on restaurant plans. **Silver** and **Free** do not auto-offer on cancel (manual promote may still be available where implemented). See migration `0117_silver_tier_limits_features.sql`. Guests receive email/WhatsApp links to accept or decline within **2 hours**. Expired offers roll to the next person in queue.

## Flow

1. Guest joins the waitlist (public portal or host-created reservation with `WAITLIST` status).
2. Each entry gets a **position** in the restaurant queue (`position ASC`).
3. On reservation **cancel** (`PATCH /api/reservations/:id` with `status: CANCELLED`):
   - `cancelled_at` and optional `cancellationReason` are stored.
   - The next `WAITING` entry with the **same party size** is offered (`offer_status = offered`, 2h expiry).
4. Guest is notified with accept/decline links (offer token).
5. **Accept** → creates a `CONFIRMED` reservation; waitlist entry → `SEATED` / `accepted`.
6. **Decline** or **expiry** → entry returns to queue; next guest is offered.
7. Background job `checkExpiredWaitlistOffers` runs every **15 minutes**.

## API

### Public (no auth)

| Method | Path                                               | Description                      |
| ------ | -------------------------------------------------- | -------------------------------- |
| POST   | `/api/public/reservations/waitlist`                | Join waitlist (assigns position) |
| POST   | `/api/public/reservations/waitlist/:token/accept`  | Accept table offer               |
| POST   | `/api/public/reservations/waitlist/:token/decline` | Decline offer                    |

`:token` is the waitlist `offer_token` (UUID) sent to the guest.

### Restaurant (auth + `RESERVATIONS_VIEW`)

| Method | Path                                              | Description                                                                      |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/reservations/waitlist`                      | List active waitlist (ordered by position)                                       |
| POST   | `/api/reservations/waitlist/:id/manually-promote` | Manually send offer to a specific entry                                          |
| PATCH  | `/api/reservations/:id`                           | Set `status: CANCELLED`, optional `cancellationReason` → triggers auto-promotion |

## Database

Migration: `0077_waitlist_auto_promotion.sql`

**`reservation`**

- `cancelled_at`, `cancellation_reason`

**`reservation_waitlist`**

- `position` — queue order per restaurant
- `notified_at` — when offer was sent
- `offer_expires_at` — offer deadline (2 hours from offer)
- `offer_status` — `none` \| `offered` \| `accepted` \| `declined` \| `expired`
- `offer_token` — public accept/decline token

## Service

`apps/api/src/services/waitlistPromotion.js`

- `handleReservationCancelled(reservation, { cancellationReason })`
- `offerNextWaitlistEntry({ restaurantId, partySize, branchId? })`
- `checkExpiredWaitlistOffers()`
- `acceptWaitlistOffer(token)` / `declineWaitlistOffer(token)`
- `manuallyPromoteWaitlistEntry(waitlistId, restaurantId)`

## Configuration

Offer links use `PUBLIC_RESERVATION_BASE_URL` or `WEB_ORIGIN`:

- Accept: `{base}/reserve/waitlist/{token}/accept` → `PublicReservationWaitlistOffer.tsx`
- Decline: `{base}/reserve/waitlist/{token}/decline` → same page (decline action)

## Tests

- `apps/api/src/services/waitlistPromotion.test.js`
- `apps/api/src/routes/reservations.routes.test.js`, `public.routes.test.js`
- `apps/web/src/pages/PublicReservationWaitlistOffer.test.tsx`, `ReservationsPage.test.tsx`
- Manual: **PUB-14 … PUB-16**, **RST-42a … RST-42c** in [regression-checklist.md](../qa/regression-checklist.md)
