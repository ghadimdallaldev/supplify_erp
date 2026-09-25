-- One open punch per person. Close older duplicate open rows so the unique index can be created.
WITH ranked_open_punches AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY restaurant_id, staff_id
           ORDER BY clock_in_at DESC NULLS LAST, created_at DESC, id DESC
         ) AS rank
  FROM staff_time_entry
  WHERE clock_out_at IS NULL
)
UPDATE staff_time_entry te
SET clock_out_at = te.clock_in_at,
    clock_out_method = COALESCE(te.clock_out_method, 'system'),
    note = CONCAT_WS(' | ', te.note, 'Closed duplicate open punch'),
    updated_at = now()
FROM ranked_open_punches ranked
WHERE te.id = ranked.id
  AND ranked.rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_time_entry_one_open
  ON staff_time_entry (restaurant_id, staff_id)
  WHERE clock_out_at IS NULL;
