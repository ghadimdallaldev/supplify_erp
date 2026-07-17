-- Light feedback storage for AI / forecast reorder recommendations

CREATE TABLE IF NOT EXISTS reorder_recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  recommended_quantity NUMERIC,
  final_quantity NUMERIC,
  selected_supplier_id UUID REFERENCES supplier(id) ON DELETE SET NULL,
  feedback_reason TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorder_rec_feedback_restaurant_created
  ON reorder_recommendation_feedback (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reorder_rec_feedback_product
  ON reorder_recommendation_feedback (restaurant_id, product_id);

COMMENT ON TABLE reorder_recommendation_feedback IS
  'Restaurant feedback on AI/forecast reorder recommendations (additive; does not replace suppressions)';
