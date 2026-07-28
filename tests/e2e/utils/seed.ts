import type { APIRequestContext } from '@playwright/test'
import { apiURL } from './env'

export type ResetSeedScenario =
  | 'orders_basic'
  | 'catalog_basic'
  | 'subscription_limits_basic'
  | 'orders_delivered'
  | 'unlock_tenants'

export interface ResetSeedOptions {
  scenario: ResetSeedScenario
  orgId?: string
  supplierId?: string
  tenantIds?: string[]
  /** Soft-fail on network/timeout (hosted flakiness). Default false. */
  soft?: boolean
}

/**
 * Calls the test-only API to reset and seed deterministic data for the given scenario.
 * Requires E2E_SECRET env and API running with E2E_SECRET set. No-op if E2E_SECRET is unset.
 * Hosted app-dev: set E2E_RESTAURANT_ORG_ID / E2E_SUPPLIER_ORG_ID to demo tenant UUIDs.
 */
export async function resetAndSeed(
  request: APIRequestContext,
  options: ResetSeedOptions
): Promise<void> {
  const secret = process.env.E2E_SECRET
  if (!secret) {
    return
  }
  const orgId = options.orgId || process.env.E2E_RESTAURANT_ORG_ID || undefined
  const supplierId = options.supplierId || process.env.E2E_SUPPLIER_ORG_ID || undefined
  const url = `${apiURL}/api/e2e/reset-seed`
  try {
    const res = await request.post(url, {
      data: {
        scenario: options.scenario,
        orgId,
        supplierId,
        tenantIds: options.tenantIds,
      },
      headers: { 'X-E2E-Secret': secret },
      timeout: 45000,
    })
    if (!res.ok()) {
      const body = await res.text()
      throw new Error(`resetAndSeed(${options.scenario}) failed: ${res.status()} ${body}`)
    }
  } catch (err) {
    if (options.soft) {
      // eslint-disable-next-line no-console
      console.warn('[resetAndSeed] soft failure:', err instanceof Error ? err.message : err)
      return
    }
    throw err
  }
}
