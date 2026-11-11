-- promotions.status was VARCHAR(20) (0074), but 0102 added 'pending_admin_approval' (22 chars) and
-- 'approved_pending_payment' (24 chars) to the check constraint, so those statuses could never be stored.

ALTER TABLE promotions ALTER COLUMN status TYPE VARCHAR(32);
