import fs from 'node:fs'
function append(file, marker, content) {
  const original = fs.readFileSync(file,'utf8')
  if (!original.includes(marker)) fs.writeFileSync(file,original.trimEnd()+'\n\n'+content.trim()+'\n')
}
fs.writeFileSync('docs/features/ai-assistant-action-roadmap.md', `# Deferred: Supplify operating copilot

Agreed 2026-11-14; shelved while the existing read-only assistant and reorder
guidance are strengthened. This document grants no execution authority and changes
no plan entitlement.

## Product direction

Serve restaurants and suppliers: identify problems, explain evidence, prepare
editable solutions, obtain approval, and show actual saved outcomes. Keep the full
assistant on Scale. The signature workflow is: “Prepare weekend purchases within
$500, account for incoming deliveries, compare suppliers, and show what to approve.”

## Future capabilities

- Today, Conversation, and Actions workspace alongside the existing assistant.
- Prioritized stock, waste, order, delivery, invoice, reservation, and fulfillment
  issues with permission-filtered evidence and source links.
- Restaurant actions: ordering lists, prepare/place purchases, eligible order
  cancellation, stock deductions/waste, reservations, statuses, and table assignment.
- Supplier actions: legal order transitions, planned routes and driver assignments,
  deal drafts, and customer reorder follow-ups.
- Both roles: explicitly approved in-app messages, execution receipts, and editable
  personal ordering/language preferences. Text, images, and PDFs support reviewed
  matching of ambiguous document rows.
- Purchasing strategies: balanced coverage/reliability, lowest comparable cost,
  and fewer suppliers. Budgets remain separate by currency.

## Required execution design

The model reads and prepares proposals. Only a server-controlled endpoint executes
an explicitly approved proposal. Reuse domain services, permissions, locks, quotas,
pricing, stock rules, delivery evidence, and existing approvals.

Persist proposals, revisions, evidence, approval, status, and receipts. Bind approval
to the exact revision and preview hash; previews expire after 15 minutes. Repricing,
availability, permission, or record changes require review again. Execution must be
transactional and idempotent. Record steps separately, stop dependent steps after
failure, and never repeat successes. Deliver notifications durably with deduplication.
Disable operational writes during impersonation. Documents/tool results are data,
never executable instructions.

Additive contracts cover proposals, edits, repreview, cancellation, execution/status,
and an eventual default-off execution kill switch. Confirmation and deterministic
calculation consume no extra model quota. Reuse the corrected read-only supply and
forecast snapshot, and maintain web/Android/iOS parity.

## Release gates

Test concurrent/retried execution, stale approval, repricing, stock and booking
conflicts, revoked access, partial workflows, and notification deduplication against
PostgreSQL. Run bilingual role evaluations, responsive/accessibility checks, then
validate dev/preprod before production with recorded sales demonstrations.

Voice, external messaging agents, unattended purchasing, payments/refunds, billing,
and staff/access administration stay deferred. Paid deal publication stays in the
existing promotion workflow.
`)
let assistant = fs.readFileSync('docs/features/ai-assistant.md','utf8')
assistant = assistant.replace('PDF attachments remain available on the message and are identified to the assistant by filename and type; this release does not extract arbitrary PDF text.', 'PDF bytes are supplied as inline model input after ownership, MIME, size, and clean-read checks. Unreadable/unsupported files produce an explicit error. Document values remain separate from verified catalog prices and stock.')
fs.writeFileSync('docs/features/ai-assistant.md',assistant)
append('docs/features/ai-assistant.md','## 2026-11-14 read-only improvements',`
## 2026-11-14 read-only improvements

The Assistant stays read-only against business records. The action-taking design
is preserved in [the deferred roadmap](./ai-assistant-action-roadmap.md). Plan,
permission, provider, and per-user quota rules remain unchanged.

- Restaurant spend is grouped by currency, excludes cancelled/draft purchases,
  and counts currently open orders separately from recent activity.
- Supplier overview adds preparation/transit workload and recent sales by currency
  with ORDERS_VIEW. Other domains retain their own permission/feature gates.
- Catalog search requires CATALOG_VIEW. Restaurant matches come from followed,
  non-blocked supplier organizations; supplier matches stay in its own catalog.
  Identity lookup/catalog comparison is not a checkout price guarantee.
- Reservation summaries require RESERVATIONS_VIEW, validate branch ownership, and
  return full local-day status/cover counts separately from a limited guest list.
  Availability uses the shared restaurant-wide engine; it never creates a booking.
- Results add evidence with retrieval time, scope, status, completeness, and an
  allowlisted source destination. It persists in sources[].evidence. A capped list
  is not a total; a failed lookup is not zero or verified live data.
- The latest 16 messages carry bounded historical record references. Changing facts
  are queried again on follow-up; recent attachments are re-read with ownership checks.
- History defaults to the latest 50 messages, chronologically. Optional limit
  (1–50) and before (message UUID) load earlier pages. Responses add hasMore and
  nextBefore; cursors remain scoped to conversation owner/workspace.
- Web/Android/iOS add conversation selection, readable sources/times, role-specific
  starters, and Arabic controls. Web supports copying; native supports selectable
  text and the system share/copy sheet. Context clears across account/workspace changes.
- Reorder answers consume the same enriched snapshot as inventory guidance. No
  assistant tool submits purchases or other operational writes.

Real document compatibility and answer quality require a deployed provider pilot.
Repository checks do not prove live model quality or physical-device behavior.
`)
append('docs/features/ai-smart-reorder.md','## 2026-11-14 corrected guidance',`
## 2026-11-14 corrected guidance (model v2)

- Receipts are supply evidence, not consumption. Purchase-history fallback never
  adds to measured movements and is not presented as a measured forecast.
- Complete restaurant-local calendar days, observed zero days, proper holdout
  cutoffs, and all future weekdays drive the forecast. Measured history requires
  seven observed days. The existing lead-time-plus-14-day buffer remains.
- Restaurant-wide history aggregates branches once. Branch quantities need a branch
  balance; shared stock is explicit. Branch-unknown cadence/expiry hints are omitted
  from branch-scoped results instead of being silently attributed to that branch.
- Outstanding inbound quantities deduct physical receipts per order line. Overdue,
  unconfirmed/undated, and incompatible-unit supply is not counted as dependable.
  Failed lookups mean unknown, not zero. Late deliveries expose bridging needs.
- Net need precedes MOQ/pack rounding. Reliable zero forecasts replace positive
  heuristics. Wait results never become a one-unit purchase. Expiry/cadence-only
  reminders require review rather than inventing a purchase quantity.
- Suggestions add action (order/wait/manual_review), incomingQty,
  uncertainIncomingQty, overdueIncomingQty, expectedUsage, netNeed, coverageDays,
  dataQuality, stockScope, orderBy, asOf, and warnings. Responses add hasMore,
  fetchedAt, timeZone, and incomingKnown. Contracts are additive across all clients.
- Web adds search, next-step/supplier filters, supply/usage/need metrics, and refresh.
  AI review is requested explicitly, not run on mount. Android/iOS show the same
  guidance in Inventory with manual cart/list handoffs. Wait/review cards cannot
  submit quantities. Checkout still validates current price, stock, quote locks,
  currencies, minimums, and packs.
- AI cache keys include the current suggestion/supply snapshot. The model cannot
  override deterministic wait/review decisions. Old model versions refresh on access.

Data strength describes evidence coverage, not a calibrated probability. Physical
device checks, live provider checks, and production-size latency remain release gates.
`)
append('docs/mobile/MOBILE_FEATURE_PARITY.md','## 2026-11-14 - Read-only Assistant and reorder guidance',`
## 2026-11-14 - Read-only Assistant and reorder guidance

Both sibling repositories receive matching Assistant/source/message types, scoped
history queries, selection/pagination, PDF input, role-specific starters, evidence
status/times, selectable answers, and system share/copy controls. New English/Arabic
strings match. Conversation scope is keyed by user/workspace; stale async results
are ignored.

Both native Inventory screens consume the existing reorder-assistance endpoint and
shared types. Stock, incoming, usage, and net need are displayed. Wait/review results
cannot add purchases. Manual additions recheck price/stock and pending checkout,
preserve quantity, and require list selection. No assistant write endpoint, auth
change, permission/feature key, or env var is introduced. Plan access is unchanged;
driver conversational access remains off.

Local verification covers source changes; hosted environments and installed native
binaries require a separate release. See [Assistant](../features/ai-assistant.md),
[reorder](../features/ai-smart-reorder.md), and [roadmap](../features/ai-assistant-action-roadmap.md).
`)
append('docs/mobile/MOBILE_PARITY_CHECKLIST.md','## 2026-11-14 read-only assistance',`
## 2026-11-14 read-only assistance

- [x] Additive Assistant evidence and history contracts mirrored in Android/iOS.
- [x] Conversation restoration/pagination, PDF input, role-specific starters, Arabic,
  source status, and share/copy controls mirrored.
- [x] Shared reorder snapshot and Inventory guidance mirrored; wait/review purchases disabled.
- [x] Existing ai_assistant and domain permission/feature gates retained; no driver Assistant.
- [x] Dated parity entry and Assistant/reorder/roadmap documentation updated.
`)
let rbac = fs.readFileSync('docs/architecture/rbac-overview.md','utf8')
rbac = rbac.replace('plus plan feature `ai_platform`.', 'plus plan feature `ai_assistant`. Smart Reorder LLM remains separately gated by `ai_platform`. The read-only reservation tools use `RESERVATIONS_VIEW` and catalog search uses `CATALOG_VIEW`; no new permission key is added.')
fs.writeFileSync('docs/architecture/rbac-overview.md',rbac)
console.log('Updated feature, roadmap, parity, and RBAC documentation')
