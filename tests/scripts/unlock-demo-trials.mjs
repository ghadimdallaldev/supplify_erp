/**
 * Unlock Demo Restaurant + Demo Supplier free trials on app-dev using saved admin storageState.
 * Usage: node tests/scripts/unlock-demo-trials.mjs
 */
import fs from 'fs'
import path from 'path'
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const adminAuth = path.join(__dirname, '..', 'e2e', '.auth', 'admin.json')
const base = process.env.PLAYWRIGHT_BASE_URL || 'https://app-dev.supplifyerp.com'

const SUBS = [
  'e4617411-7c29-4e40-90db-030e0861e9cc', // Demo Restaurant
  '77f42ccb-5761-44b9-bdbc-677030e8e6c8', // Demo Supplier
]

async function main() {
  if (!fs.existsSync(adminAuth)) {
    throw new Error(`Missing ${adminAuth}. Run auth setup first.`)
  }
  const browser = await chromium.launch()
  const context = await browser.newContext({
    storageState: adminAuth,
    ignoreHTTPSErrors: true,
    baseURL: base,
  })
  const page = await context.newPage()
  await page.goto(`${base}/app/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  for (const id of SUBS) {
    const res = await page.request.post(`${base}/api/admin-dashboard/subscriptions/${id}/extend-free-trial`, {
      data: { days: 30 },
      headers: {
        'X-Requested-With': 'Supplify',
        'Content-Type': 'application/json',
      },
    })
    const body = await res.text()
    console.log(`${id}: ${res.status()} ${body.slice(0, 200)}`)
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
