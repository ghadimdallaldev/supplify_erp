import { test, expect } from '@playwright/test'
import { expectUnauthorizedStatus } from './helpers'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const apiURL = process.env.PLAYWRIGHT_API_URL || process.env.VITE_API_URL || 'http://127.0.0.1:4000'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiReachable = () =>
  fs.existsSync(path.join(__dirname, '..', 'e2e', '.auth', '.api-reachable'))

test.describe('Registration & billing activation API', () => {
  test('GET /api/register/status without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/register/status`)
    expectUnauthorizedStatus(res.status())
  })

  test('POST /api/register/complete without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.post(`${apiURL}/api/register/complete`, {
      data: {
        accountType: 'SUPPLIER',
        businessName: 'Test Supply Co',
      },
    })
    expectUnauthorizedStatus(res.status())
  })

  test('POST /api/billing/checkout without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.post(`${apiURL}/api/billing/checkout`, {
      data: {
        planId: '00000000-0000-4000-8000-000000000001',
        billingCycle: 'MONTHLY',
        idempotencyKey: 'test-registration-activation-401',
      },
    })
    expectUnauthorizedStatus(res.status())
  })

  test('GET /api/billing/status without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/billing/status`)
    expectUnauthorizedStatus(res.status())
  })
})
