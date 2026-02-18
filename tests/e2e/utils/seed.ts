import type { APIRequestContext } from '@playwright/test'
import { apiURL } from './env'

export type ResetSeedScenario =
  | 'orders_basic'
  | 'catalog_basic'
  | 'subscription_limits_basic'
  | 'orders_delivered'

export interface ResetSeedOptions {
  scenario: ResetSeedScenario
  orgId?: string
}

/**
 * Calls the test-only API to reset and seed deterministic data for the given scenario.
 * Requires E2E_SECRET env and API running with E2E_SECRET set. No-op if E2E_SECRET is unset.
 */
export async function resetAndSeed(
  request: APIRequestContext,
  options: ResetSeedOptions
): Promise<void> {
  const secret = process.env.E2E_SECRET
  if (!secret) {
    return
  }
  const url = `${apiURL}/api/e2e/reset-seed`
  const res = await request.post(url, {
    data: { scenario: options.scenario, orgId: options.orgId },
    headers: { 'X-E2E-Secret': secret },
  })
  if (!res.ok()) {
    const body = await res.text()
    throw new Error(`resetAndSeed(${options.scenario}) failed: ${res.status()} ${body}`)
  }
}
