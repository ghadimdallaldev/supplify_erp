/**
 * Locked, resumable, verified backfill from supplier-owned categories to platform categories
 * and shelves (Plan B Task 3; spec §5.3, §11.5).
 *
 * - One dedicated client holds a session advisory lock for the whole run, so concurrent API
 *   starts run it once; the others wait, then see `verified` and skip.
 * - One transaction per supplier; the cursor (last supplier id) and the cumulative stats are
 *   written inside that transaction, so a crash resumes after the last committed supplier.
 * - The run ends `verified` only when `verifyCategoryBackfill` finds no violation, otherwise
 *   `failed` (readers keep serving through lib/category-sql.js; the next start resumes).
 */
import {
  classifyProduct,
  loadPlatformCategories,
  normalizeCategoryText,
} from './category-matcher.js'
import { connectMigrationClient, query as defaultQuery } from './db.js'
import { logger } from './logger.js'
import { bumpCatalogVersionSafe } from './relationship-cache.js'

export const CATEGORY_BACKFILL_NAME = 'category-backfill'
const LOCK_KEY = 'category-backfill'

/** The 16 original platform categories: broad leaves since 0240. */
export const BROAD_CATEGORY_SLUGS = [
  'vegetables',
  'meat-poultry',
  'seafood',
  'grains-legumes',
  'oils-fats',
  'dairy',
  'beverages',
  'spices-seasonings',
  'canned-preserved',
  'bakery-bread',
  'frozen-foods',
  'snacks-nuts',
  'condiments-sauces',
  'cleaning-supplies',
  'paper-disposables',
  'other',
]

const STAT_KEYS = [
  'suppliers',
  'shelvesCreated',
  'shelvesMerged',
  'productsAuto',
  'productsFlagged',
  'productsReclassifiedFromBroad',
  'targetsRewritten',
  'targetsSplit',
  'targetsExtended',
  'rulesRewritten',
  'rulesExtended',
  'cadencesRemapped',
  'cadencesConverted',
  'cadencesDeactivated',
]

function emptyStats() {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 0]))
}

/** Shelf identity for merging supplier categories: "Bread", "Breads" and "bread " collide. */
export function backfillShelfKey(name) {
  const text = String(name ?? '').trim()
  return normalizeCategoryText(text).normalized || text.toLowerCase()
}

function autoLeaf(text, categories, otherId) {
  if (!text) return null
  const { autoCategoryId } = classifyProduct(text, categories)
  return autoCategoryId && autoCategoryId !== otherId ? autoCategoryId : null
}

async function backfillSupplier(client, supplierId, ctx) {
  const d = emptyStats()
  const { leaves, byId, otherId, broadIds } = ctx

  // 1. Shelves from the supplier's categories (colliding names merge into one shelf).
  const { rows: cats } = await client.query(
    `SELECT id, name, display_order FROM product_category WHERE supplier_id = $1
     ORDER BY display_order NULLS LAST, created_at, id`,
    [supplierId]
  )
  const catIds = cats.map((c) => c.id)
  const oldName = new Map(cats.map((c) => [c.id, c.name]))
  const shelfOf = new Map()
  if (cats.length) {
    const { rows: shelves } = await client.query(
      'SELECT id, name FROM supplier_shelf WHERE supplier_id = $1 AND archived_at IS NULL',
      [supplierId]
    )
    const shelfByKey = new Map(shelves.map((s) => [backfillShelfKey(s.name), s.id]))
    for (const cat of cats) {
      const key = backfillShelfKey(cat.name)
      let shelfId = shelfByKey.get(key)
      if (shelfId) {
        d.shelvesMerged += 1
      } else {
        const { rows } = await client.query(
          `INSERT INTO supplier_shelf (supplier_id, name, display_order)
           VALUES ($1, $2, $3) RETURNING id`,
          [supplierId, String(cat.name).trim() || 'Shelf', cat.display_order ?? 0]
        )
        shelfId = rows[0].id
        shelfByKey.set(key, shelfId)
        d.shelvesCreated += 1
      }
      shelfOf.set(cat.id, shelfId)
    }
    const shelfIds = catIds.map((id) => shelfOf.get(id))
    await client.query(
      `INSERT INTO product_shelf (product_id, shelf_id, supplier_id)
       SELECT p.id, m.shelf_id, p.supplier_id
       FROM product p
       JOIN unnest($1::uuid[], $2::uuid[]) AS m(cat_id, shelf_id) ON p.category_id = m.cat_id
       WHERE p.supplier_id = $3
       ON CONFLICT DO NOTHING`,
      [catIds, shelfIds, supplierId]
    )

    // 2. Deal targets and routing rules on those categories now point at the shelf.
    const targets = await client.query(
      `UPDATE promotion_targets t SET shelf_id = m.shelf_id, category_id = NULL
       FROM unnest($1::uuid[], $2::uuid[]) AS m(cat_id, shelf_id), promotions pr
       WHERE t.category_id = m.cat_id AND pr.id = t.promotion_id AND pr.supplier_id = $3`,
      [catIds, shelfIds, supplierId]
    )
    d.targetsRewritten += targets.rowCount
    await client.query(
      `UPDATE promotions pr SET applies_to = 'specific_shelves', updated_at = now()
       WHERE pr.supplier_id = $1 AND pr.applies_to = 'specific_categories'
         AND EXISTS (SELECT 1 FROM promotion_targets t WHERE t.promotion_id = pr.id AND t.shelf_id IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM promotion_targets t WHERE t.promotion_id = pr.id
                         AND (t.category_id IS NOT NULL OR t.product_id IS NOT NULL))`,
      [supplierId]
    )
    const rules = await client.query(
      `UPDATE warehouse_routing_rule r
       SET shelf_id = m.shelf_id, category_id = NULL,
           rule_type = CASE WHEN r.rule_type = 'category' THEN 'shelf' ELSE r.rule_type END
       FROM unnest($1::uuid[], $2::uuid[]) AS m(cat_id, shelf_id)
       WHERE r.category_id = m.cat_id AND r.supplier_id = $3`,
      [catIds, shelfIds, supplierId]
    )
    d.rulesRewritten += rules.rowCount
  }

  // 3. Classify every product that is not on a leaf platform category (and the broad ones).
  const { rows: products } = await client.query(
    `SELECT p.id, p.name, p.category AS legacy_text, p.category_id, c.supplier_id AS old_owner
     FROM product p
     LEFT JOIN product_category c ON c.id = p.category_id
     WHERE (p.supplier_id = $1 OR p.category_id = ANY($2::uuid[]))
       AND (p.category_id IS NULL OR c.id IS NULL OR c.supplier_id IS NOT NULL
            OR c.parent_category_id IS NULL OR NOT c.is_active
            OR p.category_id = ANY($3::uuid[]))
     ORDER BY p.id
     FOR UPDATE OF p`,
    [supplierId, catIds, [...broadIds]]
  )
  const updates = { ids: [], categoryIds: [], review: [] }
  const autoByOldCategory = new Map()
  const movedFromBroad = new Map()
  for (const p of products) {
    const current = p.category_id ? byId.get(p.category_id) : null
    if (current && broadIds.has(current.id) && current.id !== otherId) {
      const auto = autoLeaf(p.name, leaves, otherId)
      if (
        auto &&
        auto !== current.id &&
        byId.get(auto)?.parent_category_id === current.parent_category_id
      ) {
        updates.ids.push(p.id)
        updates.categoryIds.push(auto)
        updates.review.push(false)
        d.productsReclassifiedFromBroad += 1
        if (!movedFromBroad.has(current.id)) movedFromBroad.set(current.id, new Set())
        movedFromBroad.get(current.id).add(auto)
      }
      continue
    }
    const attempts = [p.name, p.old_owner ? oldName.get(p.category_id) : null, p.legacy_text]
    let auto = null
    for (const text of attempts) {
      auto = autoLeaf(text, leaves, otherId)
      if (auto) break
    }
    if (current?.id === otherId) {
      // Explicitly on "Other": move on a confident match, flag only lossy legacy text.
      if (auto) {
        updates.ids.push(p.id)
        updates.categoryIds.push(auto)
        updates.review.push(false)
        d.productsAuto += 1
      } else if (p.legacy_text?.trim()) {
        updates.ids.push(p.id)
        updates.categoryIds.push(otherId)
        updates.review.push(true)
        d.productsFlagged += 1
      }
      continue
    }
    updates.ids.push(p.id)
    updates.categoryIds.push(auto || otherId)
    updates.review.push(!auto)
    if (auto) d.productsAuto += 1
    else d.productsFlagged += 1
    if (auto && p.category_id && catIds.includes(p.category_id)) {
      const counts = autoByOldCategory.get(p.category_id) || new Map()
      counts.set(auto, (counts.get(auto) || 0) + 1)
      autoByOldCategory.set(p.category_id, counts)
    }
  }
  if (updates.ids.length) {
    await client.query(
      `UPDATE product p SET category_id = u.category_id, category_needs_review = u.review,
              updated_at = now()
       FROM unnest($1::uuid[], $2::uuid[], $3::boolean[]) AS u(id, category_id, review)
       WHERE p.id = u.id`,
      [updates.ids, updates.categoryIds, updates.review]
    )
  }

  // Broad leaves keep their meaning: this supplier's deals and routing rules on a broad leaf
  // also cover the sibling leaves its products moved to.
  for (const [broadId, leafSet] of movedFromBroad) {
    const leafIds = [...leafSet]
    const extended = await client.query(
      `INSERT INTO promotion_targets (promotion_id, category_id)
       SELECT DISTINCT t.promotion_id, leaf.id
       FROM promotion_targets t
       JOIN promotions pr ON pr.id = t.promotion_id AND pr.supplier_id = $1
       CROSS JOIN unnest($3::uuid[]) AS leaf(id)
       WHERE t.category_id = $2
         AND NOT EXISTS (SELECT 1 FROM promotion_targets t2
                         WHERE t2.promotion_id = t.promotion_id AND t2.category_id = leaf.id)`,
      [supplierId, broadId, leafIds]
    )
    d.targetsExtended += extended.rowCount
    const extendedRules = await client.query(
      `INSERT INTO warehouse_routing_rule
         (supplier_id, warehouse_id, priority, rule_type, category_id, is_active)
       SELECT r.supplier_id, r.warehouse_id, r.priority, r.rule_type, leaf.id, r.is_active
       FROM warehouse_routing_rule r
       CROSS JOIN unnest($3::uuid[]) AS leaf(id)
       WHERE r.supplier_id = $1 AND r.category_id = $2
         AND NOT EXISTS (SELECT 1 FROM warehouse_routing_rule r2
                         WHERE r2.supplier_id = r.supplier_id AND r2.warehouse_id = r.warehouse_id
                           AND r2.category_id = leaf.id)`,
      [supplierId, broadId, leafIds]
    )
    d.rulesExtended += extendedRules.rowCount
  }

  // 4. Reorder cadences: remapped or converted, never deleted.
  if (catIds.length) {
    const { rows: cadences } = await client.query(
      `SELECT id, restaurant_id, supplier_id, category_id, day_of_week, is_active
       FROM restaurant_order_cadence
       WHERE category_id = ANY($1::uuid[]) AND cadence_level = 'category'
       ORDER BY id FOR UPDATE`,
      [catIds]
    )
    for (const c of cadences) {
      const counts = autoByOldCategory.get(c.category_id)
      const target = counts
        ? [...counts.entries()].sort(
            (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))
          )[0][0]
        : null
      if (target) {
        const { rows } = await client.query(
          `SELECT EXISTS (SELECT 1 FROM restaurant_order_cadence
             WHERE restaurant_id = $1 AND supplier_id = $2 AND category_id = $3 AND day_of_week = $4
               AND cadence_level = 'category' AND is_active AND id <> $5) AS taken`,
          [c.restaurant_id, c.supplier_id, target, c.day_of_week, c.id]
        )
        const deactivate = c.is_active && rows[0].taken
        await client.query(
          `UPDATE restaurant_order_cadence SET category_id = $2, is_active = is_active AND NOT $3,
                  updated_at = now() WHERE id = $1`,
          [c.id, target, deactivate]
        )
        if (deactivate) d.cadencesDeactivated += 1
        else d.cadencesRemapped += 1
      } else {
        const { rows } = await client.query(
          `SELECT EXISTS (SELECT 1 FROM restaurant_order_cadence
             WHERE restaurant_id = $1 AND supplier_id = $2 AND day_of_week = $3
               AND cadence_level = 'supplier' AND is_active AND id <> $4) AS taken`,
          [c.restaurant_id, c.supplier_id, c.day_of_week, c.id]
        )
        const deactivate = c.is_active && rows[0].taken
        await client.query(
          `UPDATE restaurant_order_cadence
           SET cadence_level = 'supplier', category_id = NULL, is_active = is_active AND NOT $2,
               updated_at = now()
           WHERE id = $1`,
          [c.id, deactivate]
        )
        if (deactivate) d.cadencesDeactivated += 1
        else d.cadencesConverted += 1
      }
    }
    await client.query(
      `UPDATE restaurant_order_cadence SET category_id = NULL, updated_at = now()
       WHERE category_id = ANY($1::uuid[]) AND cadence_level = 'supplier'`,
      [catIds]
    )
  }
  const productCadences = await client.query(
    `UPDATE restaurant_order_cadence rc SET category_id = p.category_id, updated_at = now()
     FROM product p
     WHERE rc.product_id = p.id AND rc.cadence_level = 'product'
       AND (p.supplier_id = $1 OR rc.category_id = ANY($2::uuid[]))
       AND rc.category_id IS DISTINCT FROM p.category_id`,
    [supplierId, catIds]
  )
  d.cadencesRemapped += productCadences.rowCount

  // 5. The supplier categories are now unreferenced (deferred FKs re-check at commit).
  if (catIds.length) {
    await client.query('DELETE FROM product_category WHERE supplier_id = $1', [supplierId])
  }
  return d
}

/**
 * @param {{ connect?: Function }} [db] a pool (its client holds the lock); default: migration pool
 * @param {{ onSupplierDone?: (supplierId: string) => unknown }} [options] test hook
 */
export async function runCategoryBackfill(db, options = {}) {
  const client = db?.connect ? await db.connect() : await connectMigrationClient()
  let locked = false
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [LOCK_KEY])
    locked = true
    const {
      rows: [run],
    } = await client.query('SELECT status, cursor, stats FROM data_migration_run WHERE name = $1', [
      CATEGORY_BACKFILL_NAME,
    ])
    if (run?.status === 'verified') return { ...emptyStats(), skipped: true }

    const stats = { ...emptyStats(), ...(run?.stats || {}) }
    const {
      rows: [split],
    } = await client.query(
      `SELECT stats FROM data_migration_run WHERE name = 'promotion-target-split'`
    )
    stats.targetsSplit = Number(split?.stats?.split || 0)
    await client.query(
      `INSERT INTO data_migration_run (name, status, cursor, stats, started_at)
       VALUES ($1, 'running', $2, $3, now())
       ON CONFLICT (name) DO UPDATE
       SET status = 'running', error = NULL, finished_at = NULL, stats = EXCLUDED.stats`,
      [CATEGORY_BACKFILL_NAME, run?.cursor ?? null, stats]
    )

    const categories = await loadPlatformCategories(client)
    const leaves = categories.filter((c) => c.parent_category_id)
    const byId = new Map(leaves.map((c) => [c.id, c]))
    const otherId = leaves.find((c) => c.slug === 'other')?.id
    if (!otherId) throw new Error('platform category "other" is missing')
    const broadIds = new Set(
      leaves.filter((c) => BROAD_CATEGORY_SLUGS.includes(c.slug)).map((c) => c.id)
    )
    const ctx = { leaves, byId, otherId, broadIds }

    const { rows: suppliers } = await client.query(
      'SELECT id FROM supplier WHERE ($1::uuid IS NULL OR id > $1::uuid) ORDER BY id',
      [run?.cursor?.lastSupplierId ?? null]
    )
    for (const { id: supplierId } of suppliers) {
      await client.query('BEGIN')
      try {
        const delta = await backfillSupplier(client, supplierId, ctx)
        for (const key of STAT_KEYS) {
          if (key !== 'targetsSplit') stats[key] += delta[key]
        }
        stats.suppliers += 1
        await client.query(
          `UPDATE data_migration_run SET cursor = jsonb_build_object('lastSupplierId', $2::text),
                  stats = $3 WHERE name = $1`,
          [CATEGORY_BACKFILL_NAME, supplierId, stats]
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        error.message = `supplier ${supplierId}: ${error.message}`
        throw error
      }
      if (options.onSupplierDone) await options.onSupplierDone(supplierId)
    }

    await bumpCatalogVersionSafe()
    const verification = await verifyCategoryBackfill(client)
    if (verification.ok) {
      await client.query(
        `UPDATE data_migration_run SET status = 'verified', stats = $2, finished_at = now(),
                verified_at = now(), error = NULL WHERE name = $1`,
        [CATEGORY_BACKFILL_NAME, stats]
      )
      logger.info('Category backfill verified', { event: 'category_backfill.verified', stats })
    } else {
      await client.query(
        `UPDATE data_migration_run SET status = 'failed', stats = $2, finished_at = now(),
                error = $3 WHERE name = $1`,
        [CATEGORY_BACKFILL_NAME, stats, JSON.stringify(verification.violations)]
      )
      logger.error('Category backfill verification failed', {
        event: 'category_backfill.verify_failed',
        violations: verification.violations,
      })
    }
    return { ...stats, verified: verification.ok, violations: verification.violations }
  } catch (error) {
    if (locked) {
      await client
        .query(
          `UPDATE data_migration_run SET status = 'failed', finished_at = now(), error = $2
           WHERE name = $1`,
          [CATEGORY_BACKFILL_NAME, String(error.message).slice(0, 2000)]
        )
        .catch(() => undefined)
    }
    logger.error('Category backfill failed', {
      event: 'category_backfill.failed',
      error: error.message,
    })
    throw error
  } finally {
    if (locked) {
      await client
        .query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK_KEY])
        .catch(() => undefined)
    }
    client.release()
  }
}

const LEAF = (alias) => `(${alias}.supplier_id IS NULL AND ${alias}.parent_category_id IS NOT NULL)`

/**
 * Completion predicate: every count must be 0.
 * @param {{ query: Function }} [db]
 * @returns {Promise<{ ok: boolean, violations: Record<string, number> }>}
 */
export async function verifyCategoryBackfill(db) {
  const run = db?.query ? (sql) => db.query(sql) : (sql) => defaultQuery(sql)
  const { rows } = await run(`
    SELECT
      (SELECT count(*) FROM product WHERE category_id IS NULL)::int AS "productsNullCategory",
      (SELECT count(*) FROM product p JOIN product_category c ON c.id = p.category_id
        WHERE c.supplier_id IS NULL AND c.parent_category_id IS NULL)::int AS "productsNonLeafCategory",
      (SELECT count(*) FROM product p JOIN product_category c ON c.id = p.category_id
        WHERE c.supplier_id IS NOT NULL)::int AS "productsSupplierOwnedCategory",
      (SELECT count(*) FROM product_category WHERE supplier_id IS NOT NULL)::int
        AS "supplierOwnedCategories",
      (SELECT count(*) FROM promotion_targets t JOIN product_category c ON c.id = t.category_id
        WHERE NOT ${LEAF('c')})::int AS "promotionTargetsBadCategory",
      (SELECT count(*) FROM warehouse_routing_rule r JOIN product_category c ON c.id = r.category_id
        WHERE NOT ${LEAF('c')})::int AS "routingRulesBadCategory",
      (SELECT count(*) FROM restaurant_order_cadence rc JOIN product_category c ON c.id = rc.category_id
        WHERE NOT ${LEAF('c')})::int AS "cadencesBadCategory",
      (SELECT count(*) FROM product_shelf ps JOIN product p ON p.id = ps.product_id
        WHERE p.supplier_id <> ps.supplier_id)::int AS "productShelfSupplierMismatch",
      (SELECT count(*) FROM promotion_targets
        WHERE num_nonnulls(product_id, category_id, shelf_id) <> 1)::int AS "promotionTargetsNotExactlyOne",
      (SELECT count(*) FROM product p JOIN product_category c ON c.id = p.category_id
        WHERE c.slug = 'other' AND c.supplier_id IS NULL AND p.category IS NOT NULL
          AND btrim(p.category) <> '' AND NOT p.category_needs_review)::int AS "productsUnreviewedLossy"
  `)
  const violations = rows[0]
  return { ok: Object.values(violations).every((n) => n === 0), violations }
}
