/**
 * Authenticates each role via Keycloak and saves storageState for use by tests.
 * Run once before critical_e2e and nightly (project dependency). Requires Keycloak + demo users.
 *
 * The auth files (admin.json, restaurant.json, supplier.json, .auth-ok) are written only when
 * you run `pnpm e2e:playwright` — this globalSetup runs in a headless browser and performs
 * login automatically. Logging in manually in your own browser does not create or update these files.
 *
 * To see what globalSetup is doing, run: E2E_AUTH_DEBUG=1 pnpm e2e:playwright
 */
import { chromium, FullConfig } from '@playwright/test'
import { TEST_USERS } from './utils/constants'
import { baseURL, apiURL } from './utils/env'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

// Use same .auth dir as playwright.config.ts (tests/e2e/.auth) regardless of rootDir/cwd
const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth')

function log(msg: string): void {
  if (process.env.E2E_AUTH_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[auth.setup]', msg)
  }
}

async function keycloakLogin(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  storagePath: string
): Promise<void> {
  log(`Logging in as ${email}...`)
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('login-button').click()
  // Keycloak login form (common selectors)
  await page.waitForURL(/auth\/realms|keycloak|login-actions/, { timeout: 15000 }).catch(() => {})
  const currentUrl = page.url()
  log(`After click: ${currentUrl}`)
  if (currentUrl.includes('keycloak') || currentUrl.includes('auth/realms')) {
    await page.getByLabel(/username|email|login/i).fill(email)
    await page.getByLabel(/password/i).fill(password)
    await page.getByRole('button', { name: /sign in|log in|submit/i }).click()
    await page.waitForURL((u) => u.origin === new URL(baseURL).origin && u.pathname !== '/login', {
      timeout: 20000,
    })
    log(`Back on app: ${page.url()}`)
  }
  const authDir = path.dirname(storagePath)
  if (authDir) fs.mkdirSync(authDir, { recursive: true })
  await page.context().storageState({ path: storagePath })
  log(`Saved storage to ${storagePath}`)
}

const emptyStorageState = { cookies: [], origins: [] }

export default async function globalSetup(_config: FullConfig): Promise<void> {
  fs.mkdirSync(authDir, { recursive: true })

  try {
    const w = await fetch(baseURL, { signal: AbortSignal.timeout(3000) })
    if (w.ok || w.status < 500) fs.writeFileSync(path.join(authDir, '.web-reachable'), '1')
  } catch {
    // ignore
  }
  try {
    const a = await fetch(apiURL, { signal: AbortSignal.timeout(3000) })
    if (a.ok || a.status === 401 || a.status === 404 || a.status < 500)
      fs.writeFileSync(path.join(authDir, '.api-reachable'), '1')
  } catch {
    // ignore
  }

  let browser
  try {
    browser = await chromium.launch()
  } catch {
    fs.writeFileSync(path.join(authDir, 'admin.json'), JSON.stringify(emptyStorageState))
    fs.writeFileSync(path.join(authDir, 'restaurant.json'), JSON.stringify(emptyStorageState))
    fs.writeFileSync(path.join(authDir, 'supplier.json'), JSON.stringify(emptyStorageState))
    // No .auth-ok so auth-dependent tests will skip
    return
  }

  const context = await browser.newContext()

  log(`baseURL=${baseURL} apiURL=${apiURL}`)
  let anyAuthOk = false
  for (const [role, pathsKey] of [
    ['admin', 'admin'],
    ['restaurant', 'restaurant'],
    ['supplier', 'supplier'],
  ] as const) {
    const user = TEST_USERS[role]
    const storagePath = path.join(authDir, `${pathsKey}.json`)
    const page = await context.newPage()
    try {
      await keycloakLogin(page, user.email, user.password, storagePath)
      try {
        const saved = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
        if (saved?.cookies?.length > 0) anyAuthOk = true
      } catch {
        /* ignore */
      }
    } catch (err) {
      log(`${role} login failed: ${String(err)}`)
      fs.writeFileSync(storagePath, JSON.stringify(emptyStorageState))
    } finally {
      await page.close()
    }
  }
  if (anyAuthOk) {
    fs.writeFileSync(path.join(authDir, '.auth-ok'), '1')
    log('Wrote .auth-ok (at least one role logged in)')
  } else {
    log('No role had cookies; .auth-ok not written (auth-dependent tests will skip)')
  }

  await context.close()
  await browser.close()
}
