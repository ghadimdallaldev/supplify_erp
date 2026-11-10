# Supplier promotions excellence — 2026-09-10

## Goal

Make Supplify Deals / Boosts / Featured placements production-perfect for money and cards, admin-reliable, and better than Meta Ads for restaurant–supplier B2B discovery.

## Locked decisions

| Decision            | Choice                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approach            | **A** — Promotion Ad Billing layer (sponsorship-billing pattern), then admin finance, then Meta-beating campaign UX                                           |
| PSP                 | Stripe registered behind `getBillingGateway()` when `STRIPE_SECRET_KEY` is set; stub/manual for non-live; live forbids stub                                   |
| Boost money path    | Always create `billing_invoice` (type `deal_boost`); charge links `billing_payment.invoice_id`; no silent waive when `PAYMENTS_MODE=live`                     |
| Featured money path | Same invoice type `featured_placement`; activate only after paid/manual/waived-dev                                                                            |
| Refunds             | Ledger refund on invoice + pause/cancel placement or deal boost; PSP refund when gateway supports it                                                          |
| Meta parity         | Marketplace-native (audience = restaurant type/area/follow graph, package budgets, ROAS = orders/discount vs ad spend) — not a clone of Ads Manager hierarchy |

## Architecture

### 1. Money & cards

- Module: `apps/api/src/lib/billing/promotion-ad-billing.js`
- Invoice metadata.type: `deal_boost` | `featured_placement`
- Columns: `promotions.billing_invoice_id`, `deal_promotions.billing_invoice_id`, `supplier_featured_placements.billing_invoice_id`
- Waive only when `NODE_ENV !== 'production'` **and** `PAYMENTS_MODE !== 'live'` (env `ALLOW_WAIVE_DEAL_PROMOTION_PAYMENT` ignored in live)
- Stripe provider: `apps/api/src/lib/billing/providers/stripe.js` — tokenize + charge PaymentIntent
- **Disputes:** `POST /webhooks/stripe` (raw body) verifies `PAYMENTS_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET`, handles `charge.dispute.*` → pause boost / cancel featured + `payment_status=disputed` (migration `0203`)
- Clients send `idempotencyKey` on boost pay-activation and featured purchase/pay

### 2. Admin excellence

- Insights include **ad spend** (paid boost + featured invoices), not just discount/order revenue
- Admin: mark-paid-manual, refund boost/featured, featured pricing list, unpaid queue already via `approved_pending_payment`
- Audit all money actions

### 3. Campaign quality (outperform Meta for this marketplace)

- Targeting UI for restaurant types / areas (API already supports JSON)
- Supplier ROAS: ad spend vs attributed orders / GMV / messages
- Package budgets remain flat-fee (simpler and clearer than auction for B2B pilots); daily pacing later
- Creative: keep deal image + CTA; add preview fidelity before A/B
- Organic vs paid: current product is boost-gated visibility — document clearly; optional follower organic feed is a product decision (default: keep boost-gated until product revises)

### 4. Verification

- Unit tests for promotion-ad-billing, waive gate, stripe registry
- Route tests for pay-activation with invoice_id
- E2E: create → approve → pay → restaurant sees sponsored
- Docs: `deals-and-promotions.md`, env vars, mobile parity entry

## Out of scope (this design does not drop them — later phases)

- Full Ads Manager campaign / ad-set hierarchy
- Auction bidding / quality score
- Lookalike audiences
- Multi-touch attribution pixels

## Phasing

1. **P0 Money** — invoices, waive harden, Stripe provider, featured charge, refunds ledger
2. **P1 Admin** — ad-spend insights, refund UI, featured admin pricing/actions
3. **P2 Campaign UX** — targeting UI, ROAS dashboards, reach honesty
4. **P3** — E2E hardening, mobile API client parity for pay/refund/targeting

## Error handling

- Domain `PromotionAdError` (mirror `SponsorshipError`) with codes: `PAYMENT_REQUIRED`, `PAYMENT_FAILED`, `INVALID_STATE`, `INVOICE_NOT_FOUND`
- 402 on card decline; never activate unpaid in live

## Testing

- Mirror sponsorship-billing tests for create/charge/refund
- Gateway registry: stripe listed when configured; live+stub still throws
