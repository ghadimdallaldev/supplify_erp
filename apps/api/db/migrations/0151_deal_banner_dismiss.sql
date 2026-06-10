-- Allow banner_dismiss interaction type for new-deals banner

ALTER TABLE deal_interactions DROP CONSTRAINT IF EXISTS deal_interactions_interaction_type_check;
ALTER TABLE deal_interactions ADD CONSTRAINT deal_interactions_interaction_type_check
  CHECK (interaction_type IN (
    'view', 'click', 'order', 'coupon_used', 'message',
    'add_to_cart', 'apply_to_cart', 'remove_from_cart',
    'order_created', 'order_completed', 'message_supplier',
    'banner_dismiss'
  ));

CREATE INDEX IF NOT EXISTS idx_deal_interactions_banner_dismiss
  ON deal_interactions (restaurant_id, deal_id)
  WHERE interaction_type = 'banner_dismiss';
