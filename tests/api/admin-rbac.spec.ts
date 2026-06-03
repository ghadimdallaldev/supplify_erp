import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const apiURL = process.env.PLAYWRIGHT_API_URL || process.env.VITE_API_URL || 'http://127.0.0.1:4000'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiReachable = () =>
  fs.existsSync(path.join(__dirname, '..', 'e2e', '.auth', '.api-reachable'))

test.describe('Admin API RBAC', () => {
  test('GET /api/admin-dashboard/overview without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/admin-dashboard/overview`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin-dashboard/plans without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/admin-dashboard/plans`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin-dashboard/operational-summary without auth returns 401', async ({
    request,
  }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/admin-dashboard/operational-summary`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/admin-dashboard/operational/email-logs without auth returns 401', async ({
    request,
  }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/admin-dashboard/operational/email-logs`)
    expect(res.status()).toBe(401)
  })
})
