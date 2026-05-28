/**
 * Playwright API smoke for promotions/deals endpoints.
 * Maps to MANUAL_TEST_CHECKLIST API-20, API-21, API-22 (unauthenticated baseline).
 * Feature-disabled 403 cases: apps/api/src/routes/feature-gates.routes.test.js
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const apiURL = process.env.PLAYWRIGHT_API_URL || process.env.VITE_API_URL || 'http://127.0.0.1:4000'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiReachable = () =>
  fs.existsSync(path.join(__dirname, '..', 'e2e', '.auth', '.api-reachable'))

test.describe('Promotions & deals API gates', () => {
  test('GET /api/promotions/active without auth returns 401 (API-20 baseline)', async ({
    request,
  }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/promotions/active`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/promotions/admin/pending without auth returns 401 (API-22 baseline)', async ({
    request,
  }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/promotions/admin/pending`)
    expect(res.status()).toBe(401)
  })

  test('POST /api/promotions without auth returns 401 (supplier create baseline)', async ({
    request,
  }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.post(`${apiURL}/api/promotions`, {
      data: {
        name: 'Test deal',
        type: 'percentage_discount',
        discountValue: 10,
        startsAt: new Date().toISOString(),
      },
    })
    expect(res.status()).toBe(401)
  })
})
