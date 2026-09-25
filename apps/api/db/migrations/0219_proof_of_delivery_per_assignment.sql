-- One proof of delivery per driver leg.
-- Migration 0200 kept a single row per order so a flaky retry could not stack
-- duplicates. Multi-warehouse orders have several legs, and that unique index
-- let one leg's proof replace (and unlock) every other leg. Retries still
-- update the same leg: uniqueness is the assignment when one is recorded, and
-- the order only for proofs that have no assignment.

DROP INDEX IF EXISTS uniq_proof_of_delivery_order;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_proof_of_delivery_assignment
  ON proof_of_delivery (driver_assignment_id)
  WHERE driver_assignment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_proof_of_delivery_order_unassigned
  ON proof_of_delivery (order_id)
  WHERE driver_assignment_id IS NULL;
