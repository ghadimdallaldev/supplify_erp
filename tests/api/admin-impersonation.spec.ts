import { test, expect } from '@playwright/test'
import { expectUnauthorizedStatus } from './helpers'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const apiURL = process.env.PLAYWRIGHT_API_URL || process.env.VITE_API_URL || 'http://127.0.0.1:4000'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiReachable = () =>
  fs.existsSync(path.join(__dirname, '..', 'e2e', '.auth', '.api-reachable'))

/**
 * API smoke tests for admin impersonation routes.
 * Unit tests: apps/api/src/lib/impersonation.test.js, rbac.impersonation.test.js, impersonation-guards.test.js
 * Docs: docs/features/admin-impersonation.md
 */
test.describe('Admin impersonation API', () => {
  test('GET /api/admin-dashboard/impersonate without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.get(`${apiURL}/api/admin-dashboard/impersonate`)
    expectUnauthorizedStatus(res.status())
  })

  test('POST /api/admin-dashboard/impersonate without auth returns 401', async ({ request }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.post(`${apiURL}/api/admin-dashboard/impersonate`, {
      data: { tenantId: '00000000-0000-4000-8000-000000000001', tenantType: 'RESTAURANT' },
    })
    expectUnauthorizedStatus(res.status())
  })

  test('POST /api/admin-dashboard/impersonate/stop without auth returns 401', async ({
    request,
  }) => {
    test.skip(!apiReachable(), 'API not running at apiURL')
    const res = await request.post(`${apiURL}/api/admin-dashboard/impersonate/stop`)
    expectUnauthorizedStatus(res.status())
  })
})
