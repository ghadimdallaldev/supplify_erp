import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationPath = fileURLToPath(
  new URL('../../db/migrations/0190_four_plan_pricing_model.sql', import.meta.url)
)
const sql = readFileSync(migrationPath, 'utf8')

describe('0190 four-plan pricing migration', () => {
  it('records Supplier Silver remaps in subscription change history before updating subscriptions', () => {
    expect(sql).toContain('supplier_silver_to_supplier_growth')
    expect(sql).toContain('INSERT INTO subscription_change_log')
    expect(sql).toContain("previous_plan_code = 'silver'")
    expect(sql).toContain('plan_id = ssr.to_plan_id')
  })
  it('records Restaurant Platinum remaps in subscription change history before updating subscriptions', () => {
    expect(sql).toContain('restaurant_platinum_to_restaurant_scale')
    expect(sql).toContain('restaurant_platinum_remap')
    expect(sql).toContain("sp_scale.code = 'gold'")
    expect(sql).toContain("previous_plan_code = 'platinum'")
    expect(sql).toContain('plan_id = rpr.to_plan_id')
  })

  it('includes operator review data for required overrides and preserved commercial state', () => {
    expect(sql).toContain('required_overrides JSONB')
    expect(sql).toContain('preserved_addons JSONB')
    expect(sql).toContain('preserved_overrides JSONB')
    expect(sql).toContain('branches_over_target')
    expect(sql).toContain('active_customer_locations_over_target')
    expect(sql).toContain('tenant_subscription_addon tsa')
    expect(sql).toContain('tenant_limit_override tlo')
  })
})
