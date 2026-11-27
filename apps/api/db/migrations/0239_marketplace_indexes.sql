-- Marketplace visibility performance (Plan A Task 11).
--
-- The restaurant product list orders by (created_at DESC, id DESC) with keyset paging and
-- filters by the catalog-visibility predicate. Without an index on the sort key every
-- request sorted the whole visible catalog. Benchmark on the large dataset (60k products):
-- page query 19.3 ms -> 0.45 ms (EXPLAIN in tests/integrity/marketplace/bench-results.md).
--
-- Plain CREATE INDEX: the app is pre-launch, product is small in every environment, and the
-- migration runner wraps each file in a transaction (CONCURRENTLY is not allowed there).
CREATE INDEX IF NOT EXISTS idx_product_created_id_desc
  ON product (created_at DESC, id DESC);
