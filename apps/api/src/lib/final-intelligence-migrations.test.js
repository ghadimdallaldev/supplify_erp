import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { RESTAURANT_FEATURE_KEYS } from './feature-keys.js'
import { RESTAURANT_LIMIT_KEYS } from './limit-resolution.js'

const entitlementMigration = readFileSync(
  fileURLToPath(
    new URL('../../db/migrations/0212_final_intelligence_subscription_matrix.sql', import.meta.url)
  ),
  'utf8'
)
const driverIntegrityMigration = readFileSync(
  fileURLToPath(
    new URL('../../db/migrations/0213_active_driver_assignment_integrity.sql', import.meta.url)
  ),
  'utf8'
)

/**
 * Pull the `limits`/`features` JSON documents out of the UPDATE statement that
 * targets one plan row, so the canonical-key assertions read the SQL the
 * migration will actually execute.
 */
function planJsonFromMigration(sql, code, tenantType) {
  // The compatibility INSERT near the top of the migration selects FROM the same
  // plan row, so match on the last chunk rather than the first.
  const statement = sql
    .split(/UPDATE subscription_plan/)
    .filter((chunk) => chunk.includes(`WHERE code = '${code}' AND tenant_type = '${tenantType}'`))
    .pop()
  if (!statement) throw new Error(`No UPDATE found for ${tenantType}/${code}`)

  const read = (field) => {
    const match = statement.match(new RegExp(`${field} = '(\\{[\\s\\S]*?\\})'::jsonb`))
    return match ? JSON.parse(match[1]) : null
  }
  return { limits: read('limits'), features: read('features') }
}

describe('final intelligence migrations', () => {
  it('gives the newly activated Restaurant Scale plan every canonical key', () => {
    // Platinum was an inactive Custom row, so it never carried the canonical
    // key set. verify-tier-matrix only inspects active plans, so activating it
    // with a partial merge would fail the tier-matrix guard at deploy time.
    const { limits, features } = planJsonFromMigration(
      entitlementMigration,
      'platinum',
      'RESTAURANT'
    )

    expect(Object.keys(limits ?? {}).sort()).toEqual([...RESTAURANT_LIMIT_KEYS].sort())
    expect(Object.keys(features ?? {}).sort()).toEqual([...RESTAURANT_FEATURE_KEYS].sort())
    expect(features.intelligence).toBe('scale')
    expect(features.ai_assistant).toBe(true)
    // Scale grants cross-branch visibility, never cross-branch buying.
    expect(features.multi_branch).toBe(true)
  })

  it('keeps the restaurant ladder monotonic where the migration sets values', () => {
    const scale = planJsonFromMigration(entitlementMigration, 'platinum', 'RESTAURANT')
    // Intelligence loses multi-branch, so its branch allowance drops with it.
    expect(entitlementMigration).toContain('{"branches":1}')
    expect(scale.limits.branches).toBe(-1)
    expect(scale.limits.ai_requests_per_day).toBeGreaterThan(150)
  })

  it('preserves historic Restaurant Platinum subscriptions as Custom before enabling Scale', () => {
    expect(entitlementMigration).toContain("'custom', 'Restaurant Custom'")
    expect(entitlementMigration).toContain('INSERT INTO subscription_change_log')
    expect(entitlementMigration).toContain('preserve_restaurant_custom')
    expect(entitlementMigration.indexOf('preserve_restaurant_custom')).toBeLessThan(
      entitlementMigration.indexOf("name = 'Restaurant Scale'")
    )
    expect(entitlementMigration).toContain(
      "previous_plan_code = COALESCE(s.previous_plan_code, 'platinum')"
    )
  })

  it('keeps conversational AI separate from deterministic intelligence', () => {
    expect(entitlementMigration).toContain(
      '"intelligence":"advanced","ai_assistant":false,"ai_platform":false'
    )
    expect(entitlementMigration).toContain(
      '"intelligence":"scale","ai_assistant":true,"ai_platform":true'
    )
    expect(entitlementMigration).toContain('"ai_assistant":false,"ai_platform":false')
    expect(entitlementMigration).not.toContain('central_purchasing')
  })

  it('deduplicates active driver assignments before creating partial unique indexes', () => {
    expect(driverIntegrityMigration).toContain('ranked_active_assignments')
    expect(driverIntegrityMigration).toContain("SET status = 'reassigned'")
    expect(driverIntegrityMigration).toContain('uq_active_driver_assignment_order_unassigned')
    expect(driverIntegrityMigration).toContain('uq_active_driver_assignment_warehouse_leg')
  })
})
