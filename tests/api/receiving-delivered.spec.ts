import { test, expect } from '@playwright/test'
import { expectUnauthorizedStatus } from './helpers'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const apiURL = process.env.PLAYWRIGHT_API_URL || process.env.VITE_API_URL || 'http://127.0.0.1:4000'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiReachable = () =>
  fs.existsSync(path.join(__dirname, '..', 'e2e', '.auth', '.api-reachable'))

test.describe('Receiving API (DELIVERED flow)', () => {
  test('GET /api/receiving/pending-orders without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/receiving/pending-orders`)
    expectUnauthorizedStatus(res.status())
  })

  test('GET /api/receiving/history without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/receiving/history`)
    expectUnauthorizedStatus(res.status())
  })

  test('POST /api/receiving/receive without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.post(`${apiURL}/api/receiving/receive`, {
      data: { orderId: '00000000-0000-4000-8000-000000000001', lineItems: [] },
    })
    expectUnauthorizedStatus(res.status())
  })
})
