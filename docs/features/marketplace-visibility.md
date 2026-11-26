# Marketplace Visibility (supplier ↔ restaurant relationships)

Who can see, order from, message and target whom. Spec:
[2026-11-25 design](../superpowers/specs/2026-11-25-marketplace-categories-and-visibility-design.md)
(§6 and the §11 amendment, which wins on conflict). Released in release 1 (2026-11-26).

The principle: **restaurants browse freely; suppliers reach only restaurants that chose them.**
A supplier never learns that a restaurant exists unless that restaurant follows it, sent it a
quote, or ordered from it.

## Relationship model

- `supplier_follow` and `supplier_blocklist` are keyed by `(restaurant_id, supplier_org_id)`,
  where `supplier_org_id = COALESCE(supplier.organization_id, supplier.id)`. Following one branch
  of a supplier organisation follows the organisation (migration `0238_org_level_relationships.sql`
  merged duplicate rows). The follow cap counts organisations.
- Organisation-level relationships never widen data access inside a supplier organisation: branch
  RBAC (`x-branch-id`, `getSupplierIdForRequest`) and warehouse guards still decide what a supplier
  user sees.
- **Blocking deletes the follow.** Following a blocked supplier returns `409 SUPPLIER_BLOCKED`
  until the restaurant unblocks it.
- `apps/api/src/lib/relationship.js` is the single source of the rule:
  - SQL fragments `supplierOrgIdSql`, `followExistsSql`, `blockedExistsSql`, `catalogVisibleSql`,
    `supplierSeesRestaurantSql`;
  - predicates `getRelationship`, `canTransact` (follow ∧ ¬blocked), `canSeeRestaurant`
    (follow ∧ ¬blocked), `canViewCatalog` (¬blocked ∧ (follow ∨ public catalog)),
    `transactableSupplierIds`;
  - advisory locks `lockRelationshipShared` / `lockRelationshipExclusive` on
    `(restaurant, supplier org)`.
- Writes go through `services/relationship-writes.service.js`: manual follow, accepting a supplier
  invite and referral signup all enforce the plan cap inside one transaction under the exclusive
  lock. Follow, unfollow, block and unblock take the exclusive lock; order creation, message send,
  contract writes and sponsorship offers take the shared lock and re-check inside the same
  transaction as their write.

## Rule table

| Capability                                                                          | Needs                                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Restaurant searches / views suppliers                                               | not blocked                                                          |
| Restaurant views products, prices, product detail, deals, category counts           | not blocked ∧ (follows ∨ `public_catalog_enabled`)                   |
| Restaurant sees stock                                                               | in-stock / out-of-stock flag only, never quantities                  |
| Restaurant sees contract prices                                                     | its own only                                                         |
| Restaurant places any new order (cart, reorder, Quick List, scheduled, from quote)  | follow ∧ not blocked                                                 |
| Replacement order from a dispute                                                    | not blocked (no follow needed: it remedies an existing order)        |
| Restaurant sends a quote request to selected suppliers                              | supplier not blocked and active (no follow)                          |
| Start a conversation or send a general message (either side)                        | follow ∧ not blocked                                                 |
| Send an order-tagged message (`order_id`)                                           | both parties on that order, order open, not blocked                  |
| Read an existing conversation                                                       | participant (read-only without follow; supplier loses it on a block) |
| Supplier sees a restaurant in its customer list / detail page / pickers             | follow ∧ not blocked                                                 |
| Supplier creates a manual order, contract price, sponsorship offer for a restaurant | follow ∧ not blocked                                                 |
| Supplier intelligence (reorder assistance, at-risk, cross-sell, loyalty, Assistant) | followers only                                                       |
| Supplier reads past orders, invoices, credit notes, deliveries, payments            | order participant (read-only), regardless of follow or block         |

Deals are **app-wide within catalog visibility**: every active, paid deal is shown to every
restaurant that can see the supplier's catalog. `restaurantIds` targeting was removed; boosts only
change ranking and the area / business-type audience filter.

## Unfollow

- Supplier: the restaurant leaves its customer list, pickers and intelligence; general chat becomes
  read-only; no new manual orders, contracts or sponsorship offers. Past records stay readable, with
  the restaurant name as on the invoice.
- Restaurant: general chat read-only; catalog and deals still visible (public catalogs); products
  show **Follow & add** / **Follow to order**; a scheduled order for that supplier is skipped and the
  restaurant gets `SCHEDULED_ORDER_SKIPPED_UNFOLLOWED`.
- **Open orders finish normally**: confirm, fulfil, deliver, invoice, disputes and order-tagged
  messages keep working until the order is closed (cancelled, or delivered and received).
- Contracts are kept in the database but hidden; following again restores everything.
- An active, paid sponsorship runs to its end date; no new offers or renewals.

## Block

A block is stronger than an unfollow: the supplier loses the restaurant from every list, detail
page, picker, manual order, contract and sponsorship, and the restaurant no longer sees the supplier
anywhere. The conversation closes for both sides: nobody can send, the supplier can no longer open
it, and the restaurant keeps read-only history. Order-tagged messages stay visible in that order's
detail. Financial records stay readable. Open orders stay fulfillable, but order chat closes.

## Chat

- Conversation list rows carry `can_send_general`, `is_closed_by_block` and `open_order_ids`.
- Clients show a closed banner (block), or a read-only banner with **Message about order #…** chips
  for each open order (web `ChatComposer`, mobile `ChatAccessBanner`).
- HTTP send and socket `send_message` use one check (`lib/chat-access.js`,
  `lib/chat-conversation.js`). Sockets carry `order_id` like REST. A refused socket send emits
  `chat_error { code: 'CHAT_READ_ONLY', openOrderIds }`.
- Message notifications are sent only after an authorised send.
- Chat attachments are served through an authenticated endpoint that re-checks conversation access.

## Quotes

Restaurants send quotes to any selected, non-blocked, active suppliers; no follow is needed. The
supplier sees the restaurant's display name, the note, the needed-by date and its own lines only —
never the restaurant's id, contacts, address, branches or the other invited suppliers. Turning a
quote into an order needs a follow. A block hides the quote from the supplier. The web and mobile
supplier pickers search the server (`sort=followed`, paginated) and mark followed suppliers.

## Customer import, reviews, reports

- Prospect matching uses only exact normalised email or phone. Its result is never returned to the
  supplier. Prospect statuses are `imported`, `invited`, `following`. Matched and unmatched invites
  are dispatched asynchronously with identical responses. The `connect` and `rematch` endpoints are
  gone. A matched restaurant gets an in-app `SUPPLIER_FOLLOW_INVITE` (Follow / Dismiss); a blocked
  supplier's invite is dropped silently.
- Reviews return `reviewer_label: "Verified restaurant"` to the public and to suppliers.
- "Top restaurants" reports and deal analytics name followers only; everyone else is grouped as
  "Other customers" / "Verified restaurant" with a null `restaurant_id`.

## Error codes

| HTTP | `error.name`                    | When                                                                                                                                                                | `details`                                    |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 403  | `FOLLOW_REQUIRED`               | New order (checkout, reorder, quote → order) for an unfollowed supplier                                                                                             | `suppliers: [{ id, name }]`                  |
| 403  | `CHAT_READ_ONLY`                | General send without a follow, or order send on a closed order                                                                                                      | `openOrderIds: string[]`                     |
| 404  | `RESTAURANT_NOT_AVAILABLE`      | Supplier customer detail, manual order, contract price or sponsorship for a non-following restaurant. Same body for "does not exist", so it cannot be used to probe | —                                            |
| 409  | `SUPPLIER_BLOCKED`              | Restaurant follows a supplier it blocked                                                                                                                            | —                                            |
| 403  | `SUPPLIER_FOLLOW_LIMIT_REACHED` | Follow over the plan's organisation cap                                                                                                                             | `current`, `limit`, `requiredPlan: 'Growth'` |

Conversation creation returns the same 404 for "doesn't exist" and "not allowed".

## Realtime revocation and caches

Every relationship change calls `emitRelationshipChanged({ restaurantId, supplierOrgId, kind })`
after commit. Registered hooks:

- `lib/relationship-cache.js`: bumps `catalog:version` (part of every catalog-meta key; category and
  tag counts are per viewer), deletes the restaurant's dashboard summary and reorder
  recommendations (marks forecasts dirty), and the command center and dashboard summary of every
  branch of the supplier organisation.
- `lib/socket.js`: removes the supplier's sockets from each affected `conversation_<id>` room and
  emits `conversation_access_changed { conversationId }` to the supplier and restaurant rooms. Web
  (`useChatRealtime`) and mobile (`ChatThreadScreen`) refetch the conversation on that event.

## Indexes and performance

`0239_marketplace_indexes.sql` adds the indexes behind the org-level lookups. Benchmarks
(`bench.pg.test.js`, `MARKETPLACE_BENCH=1`) keep p95 within the plan budgets: relationship lookup
≈1.5 ms, product list ≈28 ms, grouped search ≈55 ms, customer list ≈29 ms, deal list ≈33 ms,
conversation list ≈25 ms on the audit dataset.

## Tests

- Real-database suite: `pnpm test:marketplace:pg` (needs `SUPPLIFY_MARKETPLACE_DATABASE_URL`):
  relationships, follow cap, orders, catalog visibility, chat, supplier lookups, intelligence,
  sponsorships and deals, import enumeration, benchmarks.
- API unit: `lib/relationship.test.js`, `lib/relationship-cache.test.js`, `lib/chat-access.test.js`,
  `services/relationship-writes.service.test.js`, `routes/orders/create.follow.test.js`.
- Web: `FollowAndAddButton`, `FollowRequiredPanel`, `useCartActions`, `ChatComposer`,
  `useChatRealtime`, `FollowerRestaurantPicker`, `SupplierCustomerGrowthPage`,
  `CreateQuoteRequestPage`.
- Mobile (both repos): `MarketplaceFollow`, `ChatAccess`, `CustomerGrowthScreen`,
  `CreateQuoteRequestScreen`, `notificationNavigation`.

## Mobile parity

Both apps implement Follow & add, cart FOLLOW_REQUIRED rows, the private-catalog card, chat banners,
server-searched follower pickers, the growth status, "Other customers" and the two follow
notifications. See [mobile feature parity](../mobile/MOBILE_FEATURE_PARITY.md) (2026-11-26).

## See also

- [Supplier follow](./supplier-follow.md) · [Customer growth](./supplier-customer-growth.md) ·
  [Deals and promotions](./deals-and-promotions.md) · [Search and discovery](./search-and-discovery.md) ·
  [RBAC overview](../architecture/rbac-overview.md)
