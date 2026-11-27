# Marketplace visibility benchmarks (Plan A Task 11)

Run with `MARKETPLACE_BENCH=1 pnpm test:marketplace:pg -- bench.pg.test.js`, against
PostgreSQL 16 in Docker on a Windows 11 dev host. Dataset (`seed-large.js`): 300 supplier
orgs, 600 branches, 2,000 restaurants, 60,000 products, 19,980 follows, 500 blocks,
50,000 orders, 2,000 conversations and 600 active deals. Each figure is p95 over 50 warm
calls, best of 3 rounds (single rounds on this host varied by up to 70%).

## Results (2026-11-26)

| Query                                                 | Before   | After (best of 3) | Rounds             | Budget |
| ----------------------------------------------------- | -------- | ----------------- | ------------------ | ------ |
| getRelationship                                       | 1.98 ms  | 1.53 ms           | 1.9 / 1.7 / 1.5    | 2 ms   |
| productList (`/api/products?limit=24`)                | 66.14 ms | 27.81 ms          | 31.2 / 29.6 / 27.8 | 60 ms  |
| groupedSearch (`/api/search?q=tomato&grouped=true`)   | 76.95 ms | 54.50 ms          | 55.9 / 58.2 / 54.5 | 120 ms |
| customerList (`/api/restaurants?limit=50`)            | 32.03 ms | 29.04 ms          | 32.1 / 29.0 / 33.9 | 40 ms  |
| dealList (`/api/promotions/active`)                   | 35.61 ms | 33.07 ms          | 33.1 / 39.9 / 33.4 | 80 ms  |
| conversationList (`/api/chat/conversations?limit=50`) | 29.28 ms | 24.81 ms          | 25.8 / 24.8 / 25.7 | 40 ms  |

## Query counts (small page against large page)

No endpoint issues a relationship query (`supplier_follow` / `supplier_blocklist`) per row.

| Endpoint                          | Small | Large | Notes                                                                                                                |
| --------------------------------- | ----- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| /api/products (5 vs 24)           | 24    | 23    | constant                                                                                                             |
| /api/search grouped (2 vs 10)     | 26    | 26    | before the fix: 27 vs 35 (one warehouse COUNT per supplier)                                                          |
| /api/restaurants (5 vs 50)        | 20    | 25    | the extra statements are auth role/permission cache refills (`tenant_roles`, `tenant_role_permissions`), not per-row |
| /api/chat/conversations (5 vs 50) | 26    | 26    | constant                                                                                                             |

## Changes

1. **Migration `0239_marketplace_indexes.sql`** adds `idx_product_created_id_desc ON product (created_at DESC, id DESC)`.
   The product list sorts by this key with keyset paging. Without the index, every request
   sorted the whole visible catalog.
2. **`supplier-stock.service.js`**:
   - `supplierUsesWarehouseInventory` checks the plan feature before running the warehouse COUNT.
   - `overlayProductRowsWithAuthoritativeStock` now uses one warehouse lookup and one stock
     aggregate per page, instead of a COUNT and an aggregate per supplier.
3. **Visibility predicate unchanged.** Rewriting `catalogVisibleSql` as a visible-supplier
   semi-join was measured and was not faster (count 10.8 ms against 12.0 ms; page 40.9 ms against 44.1 ms).
   The existing `UNIQUE (restaurant_id, supplier_org_id)` indexes on follow and blocklist serve
   both EXISTS probes.

## EXPLAIN (ANALYZE, BUFFERS): product page query

```
Pager usage is off.
### page created_at DESC, id DESC — without index
                                                                                         QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=7202.79..7209.44 rows=25 width=24) (actual time=15.078..19.121 rows=25 loops=1)
   Buffers: shared hit=4299
   ->  Nested Loop Anti Join  (cost=7202.79..19133.14 rows=44850 width=24) (actual time=15.076..19.116 rows=25 loops=1)
         Join Filter: (b.supplier_org_id = COALESCE(s.organization_id, s.id))
         Rows Removed by Join Filter: 25
         Buffers: shared hit=4299
         ->  Nested Loop  (cost=7202.51..18449.85 rows=45000 width=56) (actual time=14.984..19.014 rows=25 loops=1)
               Buffers: shared hit=4296
               ->  Gather Merge  (cost=7202.23..14190.22 rows=60000 width=40) (actual time=14.847..18.754 rows=49 loops=1)
                     Workers Planned: 2
                     Workers Launched: 2
                     Buffers: shared hit=4158
                     ->  Sort  (cost=6202.21..6264.71 rows=25000 width=40) (actual time=11.730..11.804 rows=687 loops=3)
                           Sort Key: p.created_at DESC, p.id DESC
                           Sort Method: quicksort  Memory: 1983kB
                           Buffers: shared hit=4158
                           Worker 0:  Sort Method: quicksort  Memory: 2112kB
                           Worker 1:  Sort Method: quicksort  Memory: 1961kB
                           ->  Parallel Seq Scan on product p  (cost=0.00..4376.00 rows=25000 width=40) (actual time=2.187..6.608 rows=20000 loops=3)
                                 Buffers: shared hit=4126
               ->  Memoize  (cost=0.29..4.61 rows=1 width=32) (actual time=0.005..0.005 rows=1 loops=49)
                     Cache Key: p.supplier_id
                     Cache Mode: logical
                     Hits: 4  Misses: 45  Evictions: 0  Overflows: 0  Memory Usage: 5kB
                     Buffers: shared hit=138
                     ->  Index Scan using supplier_pkey on supplier s  (cost=0.28..4.60 rows=1 width=32) (actual time=0.005..0.005 rows=0 loops=45)
                           Index Cond: (id = p.supplier_id)
                           Filter: ((hashed SubPlan 2) OR public_catalog_enabled)
                           Rows Removed by Filter: 1
                           Buffers: shared hit=138
                           SubPlan 2
                             ->  Index Only Scan using uq_supplier_follow_restaurant_org on supplier_follow f  (cost=0.29..4.46 rows=10 width=16) (actual time=0.062..0.064 rows=10 loops=1)
                                   Index Cond: (restaurant_id = '8a9be6cd-4f19-4a10-b9b2-792454075034'::uuid)
                                   Heap Fetches: 0
                                   Buffers: shared hit=3
         ->  Materialize  (cost=0.27..8.30 rows=1 width=16) (actual time=0.004..0.004 rows=1 loops=25)
               Buffers: shared hit=3
               ->  Index Only Scan using uq_supplier_blocklist_restaurant_org on supplier_blocklist b  (cost=0.27..8.29 rows=1 width=16) (actual time=0.085..0.086 rows=1 loops=1)
                     Index Cond: (restaurant_id = '8a9be6cd-4f19-4a10-b9b2-792454075034'::uuid)
                     Heap Fetches: 1
                     Buffers: shared hit=3
 Planning:
   Buffers: shared hit=712
 Planning Time: 3.662 ms
 Execution Time: 19.349 ms
(45 rows)

CREATE INDEX
ANALYZE
### page created_at DESC, id DESC — with index (created_at DESC, id DESC)
                                                                                         QUERY PLAN
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=0.97..14.10 rows=25 width=24) (actual time=0.115..0.320 rows=25 loops=1)
   Buffers: shared hit=190 read=3
   ->  Nested Loop Anti Join  (cost=0.97..23547.22 rows=44850 width=24) (actual time=0.114..0.315 rows=25 loops=1)
         Join Filter: (b.supplier_org_id = COALESCE(s.organization_id, s.id))
         Rows Removed by Join Filter: 25
         Buffers: shared hit=190 read=3
         ->  Nested Loop  (cost=0.70..22863.92 rows=45000 width=56) (actual time=0.092..0.281 rows=25 loops=1)
               Buffers: shared hit=187 read=3
               ->  Index Scan using bench_idx_product_created_id on product p  (cost=0.41..18604.29 rows=60000 width=40) (actual time=0.044..0.116 rows=49 loops=1)
                     Buffers: shared hit=49 read=3
               ->  Memoize  (cost=0.29..4.61 rows=1 width=32) (actual time=0.003..0.003 rows=1 loops=49)
                     Cache Key: p.supplier_id
                     Cache Mode: logical
                     Hits: 4  Misses: 45  Evictions: 0  Overflows: 0  Memory Usage: 5kB
                     Buffers: shared hit=138
                     ->  Index Scan using supplier_pkey on supplier s  (cost=0.28..4.60 rows=1 width=32) (actual time=0.003..0.003 rows=0 loops=45)
                           Index Cond: (id = p.supplier_id)
                           Filter: ((hashed SubPlan 2) OR public_catalog_enabled)
                           Rows Removed by Filter: 1
                           Buffers: shared hit=138
                           SubPlan 2
                             ->  Index Only Scan using uq_supplier_follow_restaurant_org on supplier_follow f  (cost=0.29..4.46 rows=10 width=16) (actual time=0.014..0.016 rows=10 loops=1)
                                   Index Cond: (restaurant_id = '8a9be6cd-4f19-4a10-b9b2-792454075034'::uuid)
                                   Heap Fetches: 0
                                   Buffers: shared hit=3
         ->  Materialize  (cost=0.27..8.30 rows=1 width=16) (actual time=0.001..0.001 rows=1 loops=25)
               Buffers: shared hit=3
               ->  Index Only Scan using uq_supplier_blocklist_restaurant_org on supplier_blocklist b  (cost=0.27..8.29 rows=1 width=16) (actual time=0.012..0.013 rows=1 loops=1)
                     Index Cond: (restaurant_id = '8a9be6cd-4f19-4a10-b9b2-792454075034'::uuid)
                     Heap Fetches: 1
                     Buffers: shared hit=3
 Planning:
   Buffers: shared hit=132 read=1
 Planning Time: 1.072 ms
 Execution Time: 0.446 ms
(35 rows)

DROP INDEX
```

## Plan B — platform categories (2026-11-27)

Same host and method. `seed-large.js` now spreads the 60,000 products over the 85 active leaf
categories (release 2 makes `product.category_id` required).

| Query                                                                 | Before    | After (best of 3) | Rounds             | Budget |
| --------------------------------------------------------------------- | --------- | ----------------- | ------------------ | ------ |
| categoryTree (`/api/products/categories`, restaurant, cache bypassed) | 841.01 ms | 44.14 ms          | 44.1 / 57.2 / 52.8 | 50 ms  |
| categoryProductList (`/api/products?categoryId=<dept>&limit=24`)      | 38.67 ms  | 41.85 ms          | 57.1 / 49.7 / 41.8 | 60 ms  |

The tree's per-product `EXISTS` visibility filter made the planner cost the whole-catalog count
at ~1.5M, which switched on JIT (82 functions, ~650 ms of compilation for ~90 ms of work).
Resolving the visible suppliers once (`WITH vis AS MATERIALIZED`) and hash-joining them, plus
`COUNT(*)` instead of `COUNT(DISTINCT p.id)` (the leaf join is one row per product), brings the
raw query from 674 ms to 35 ms p95 with identical counts for restaurant, supplier and admin
callers. Each benchmark call bumps `catalog:version`, so it measures the uncached path; warm
calls are served from the per-viewer cache. The other budgets were re-run on the new seed and
all pass (getRelationship 1.33, productList 36.78, groupedSearch 69.60, customerList 30.88,
dealList 36.27, conversationList 26.18 ms).
