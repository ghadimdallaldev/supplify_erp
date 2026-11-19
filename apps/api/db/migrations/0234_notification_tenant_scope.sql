-- Preserve history; associate only references with deterministic ownership.
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX IF NOT EXISTS notification_log_tenant_user_unread
  ON notification_log(user_id, user_type, tenant_id, is_read, created_at DESC);
WITH order_owners AS (
  SELECT order_id, (array_agg(DISTINCT supplier_id))[1] AS supplier_id FROM order_item
  GROUP BY order_id HAVING COUNT(DISTINCT supplier_id) = 1
)
UPDATE notification_log n SET tenant_id = CASE n.user_type WHEN 'SUPPLIER' THEN owners.supplier_id ELSE o.restaurant_id END
FROM customer_order o LEFT JOIN order_owners owners ON owners.order_id = o.id
WHERE n.reference_type = 'ORDER' AND n.reference_id = o.id AND n.tenant_id IS NULL
  AND n.user_type IN ('SUPPLIER', 'RESTAURANT');
UPDATE notification_log n SET tenant_id = CASE n.user_type WHEN 'SUPPLIER' THEN i.supplier_id ELSE i.restaurant_id END
FROM invoice i WHERE n.reference_type = 'INVOICE' AND n.reference_id = i.id AND n.tenant_id IS NULL
  AND n.user_type IN ('SUPPLIER', 'RESTAURANT');
UPDATE notification_log n SET tenant_id = CASE n.user_type WHEN 'SUPPLIER' THEN c.supplier_id ELSE c.restaurant_id END
FROM conversation c WHERE n.reference_type IN ('CHAT', 'CONVERSATION') AND n.reference_id = c.id AND n.tenant_id IS NULL
  AND n.user_type IN ('SUPPLIER', 'RESTAURANT');
-- Other old rows remain stored, but cannot be shown as tenant-scoped business data
-- until a trustworthy source identifies their tenant. Never infer it from an email.
