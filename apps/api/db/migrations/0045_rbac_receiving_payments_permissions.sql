-- Migration: 0045_rbac_receiving_payments_permissions.sql
-- Add RECEIVING_VIEW, RECEIVING_MANAGE, PAYMENTS_VIEW, PAYMENTS_MANAGE and assign to roles.

INSERT INTO permission (code, name, domain, description) VALUES
  ('RECEIVING_VIEW', 'View receiving', 'RECEIVING', 'View pending orders and receiving reports'),
  ('RECEIVING_MANAGE', 'Manage receiving', 'RECEIVING', 'Accept, reject, and submit receiving reports'),
  ('PAYMENTS_VIEW', 'View payments', 'PAYMENTS', 'View payment history and status'),
  ('PAYMENTS_MANAGE', 'Manage payments', 'PAYMENTS', 'Record and manage invoice payments')
ON CONFLICT (code) DO NOTHING;

-- Restaurant Owner / Manager / Staff: receiving and payments
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id FROM role r, permission p
WHERE r.code IN ('RESTAURANT_OWNER', 'RESTAURANT_MANAGER', 'RESTAURANT_STAFF')
  AND p.code IN ('RECEIVING_VIEW', 'RECEIVING_MANAGE', 'PAYMENTS_VIEW', 'PAYMENTS_MANAGE')
ON CONFLICT (role_id, permission_id) DO NOTHING;
