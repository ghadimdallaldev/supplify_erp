# Deferred: Supplify operating copilot

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
