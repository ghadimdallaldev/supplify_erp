#!/usr/bin/env node
import 'dotenv/config'
import { pool } from '../src/lib/db.js'
import { RESTAURANT_FEATURE_KEYS, SUPPLIER_FEATURE_KEYS } from '../src/lib/feature-keys.js'
import { RESTAURANT_LIMIT_KEYS, SUPPLIER_LIMIT_KEYS } from '../src/lib/limit-resolution.js'

function evalFeature(v) {
  if (v === true) return true
  if (v === false || v == null) return false
  if (typeof v === 'string') return v !== 'false' && v !== 'disabled' && v !== ''
  return Boolean(v)
}

const { rows } = await pool.query(
  `SELECT code, name, tenant_type, limits, features FROM subscription_plan
   WHERE is_active = true ORDER BY tenant_type, display_order NULLS LAST, code`
)

const out = {}
for (const tt of ['RESTAURANT', 'SUPPLIER']) {
  const fkeys = tt === 'RESTAURANT' ? RESTAURANT_FEATURE_KEYS : SUPPLIER_FEATURE_KEYS
  const lkeys = tt === 'RESTAURANT' ? RESTAURANT_LIMIT_KEYS : SUPPLIER_LIMIT_KEYS
  out[tt] = {}
  for (const plan of rows.filter((r) => r.tenant_type === tt)) {
    const lim = plan.limits || {}
    const feat = plan.features || {}
    out[tt][plan.code] = {
      name: plan.name,
      enabledFeatures: fkeys.filter((k) => evalFeature(feat[k])),
      disabledFeatures: fkeys.filter((k) => !evalFeature(feat[k])),
      numericLimits: Object.fromEntries(
        lkeys
          .filter((k) => {
            const v = lim[k]
            return v !== -1 && v != null && v !== undefined
          })
          .map((k) => [k, lim[k]])
      ),
      unlimitedLimits: lkeys.filter((k) => {
        const v = lim[k]
        return v === -1 || v == null || v === undefined
      }),
      rawFeatureValues: Object.fromEntries(
        fkeys.map((k) => [k, feat[k] ?? null])
      ),
    }
  }
}
console.log(JSON.stringify(out, null, 2))
await pool.end()
