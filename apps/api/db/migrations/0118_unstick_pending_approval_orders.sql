-- Release legacy orders stuck in PENDING_APPROVAL after approvals product removal.
-- Tables order_approvals / approval_rules / budget_* are left intact for audit only.

UPDATE customer_order
SET
  status = 'PLACED',
  placed_at = COALESCE(placed_at, created_at, NOW()),
  updated_at = NOW()
WHERE status = 'PENDING_APPROVAL';

UPDATE order_approvals
SET
  status = 'approved',
  notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE ' | ' END ||
    'Auto-released: order approvals product removed',
  decided_at = COALESCE(decided_at, NOW())
WHERE status = 'pending';
