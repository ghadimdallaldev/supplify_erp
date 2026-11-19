-- Manual placements use supplier + restaurant actor scopes. Keep historical rows
-- for owned replay while allowing independent actors to reuse the same client key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_placement_idempotency_actor_key
  ON order_placement_idempotency(actor_scope, idempotency_key);

DO $$
DECLARE legacy_constraint RECORD;
BEGIN
  FOR legacy_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'order_placement_idempotency'::regclass
      AND c.contype = 'u'
      AND c.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'restaurant_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'idempotency_key')
      ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE order_placement_idempotency DROP CONSTRAINT %I', legacy_constraint.conname);
  END LOOP;
END $$;

COMMENT ON TABLE order_placement_idempotency IS
  'Actor-scoped placement keys and replayable responses for restaurant, supplier manual and public checkout.';
