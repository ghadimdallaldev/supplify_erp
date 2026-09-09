-- One proof of delivery per order.
-- Drivers on flaky mobile connections retry the POST, which previously inserted a
-- duplicate POD row each time; readers then picked an arbitrary one and the
-- restaurant's "confirm receipt" could land on a row nobody was looking at.

-- Collapse existing duplicates onto the most complete / most recent row.
WITH ranked AS (
  SELECT
    id,
    order_id,
    ROW_NUMBER() OVER (
      PARTITION BY order_id
      ORDER BY
        confirmed_at IS NOT NULL DESC,
        (file_key IS NOT NULL OR delivery_photo_url IS NOT NULL) DESC,
        (signature_file_key IS NOT NULL OR signature_image_url IS NOT NULL) DESC,
        delivery_timestamp DESC,
        created_at DESC
    ) AS rn
  FROM proof_of_delivery
)
DELETE FROM proof_of_delivery pod
USING ranked
WHERE pod.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_proof_of_delivery_order
  ON proof_of_delivery (order_id);
