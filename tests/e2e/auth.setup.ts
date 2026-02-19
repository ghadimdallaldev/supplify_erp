/**
 * Authenticates each role via Keycloak and saves storageState for use by tests.
 * Run once before critical_e2e and nightly. Requires Keycloak + demo users.
 *
 * Flow: navigate to protected route (app/dashboard) → if redirected to Keycloak, fill and submit
 * → wait for redirect back to app → assert sidebar visible and not on /login or expired.
 * Validates storageState (cookies present, not on Keycloak/login/expired) before saving.
 *
 * Run with E2E_AUTH_DEBUG=1 for verbose logs.
 */
import { chromium, FullConfig } from '@playwright/test'
import { TEST_USERS } from './utils/constants'
import { baseURL, apiURL } from './utils/env'
import { authAvailableAsync } from './utils/reachability'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, '.auth')
const testResultsDir = path.join(__dirname, '..', 'test-results')

const APP_ORIGIN = new URL(baseURL).origin
const SIDEBAR_TESTID = 'sidebar'
const KEYCLOAK_REALM_PATH = '/realms/Supplify/'
const REDIRECT_TIMEOUT_MS = 15000

const AUTH_DEBUG_URL_PATTERNS = [':8080', '/realms/', '/openid-connect/', '/auth', '/login']
const API_ERROR_LOG_PATTERN = '/api/'
function shouldLogRequest(url: string): boolean {
  return AUTH_DEBUG_URL_PATTERNS.some((p) => url.includes(p))
}
function shouldLogApiError(url: string): boolean {
  return url.includes(API_ERROR_LOG_PATTERN)
}

function log(msg: string): void {
  if (process.env.E2E_AUTH_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[auth.setup]', msg)
  }
}

async function dumpFailureDiagnostics(
  page: import('@playwright/test').Page,
  roleLabel: string
): Promise<void> {
  const url = page.url()
  const title = await page.title().catch(() => '')
  // eslint-disable-next-line no-console
  console.log('[auth.setup] failure URL:', url)
  // eslint-disable-next-line no-console
  console.log('[auth.setup] failure title:', title)
  fs.mkdirSync(testResultsDir, { recursive: true })
  const screenshotPath = path.join(testResultsDir, `auth-setup-${roleLabel}.png`)
  await page.screenshot({ path: screenshotPath }).catch(() => {})
  // eslint-disable-next-line no-console
  console.log('[auth.setup] screenshot:', screenshotPath)
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
  // eslint-disable-next-line no-console
  console.log('[auth.setup] body text (first 500 chars):', bodyText.slice(0, 500))
}

function patchSecureCookiesForLocalHttp(
  cookies: {
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
  }[]
): typeof cookies {
  return cookies.map((c) => ({ ...c, secure: false }))
}

function attachAuthRequestLogging(context: import('@playwright/test').BrowserContext): void {
  context.on('requestfailed', (request) => {
    const url = request.url()
    if (shouldLogRequest(url)) {
      const failure = request.failure()
      const msg =
        failure && 'message' in failure
          ? (failure as { message?: string }).message
          : failure && 'errorText' in failure
            ? (failure as { errorText?: string }).errorText
            : ''
      // eslint-disable-next-line no-console
      console.log('[auth.setup] requestfailed:', url, msg || '')
    }
  })
  context.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    if (status >= 400 && (shouldLogRequest(url) || shouldLogApiError(url))) {
      // eslint-disable-next-line no-console
      console.log('[auth.setup] response >= 400:', status, url)
    }
  })
}

/**
 * Robust Keycloak login: navigate to protected route, detect Keycloak redirect, fill and submit,
 * wait for redirect back to app, assert sidebar and no /login or expired.
 */
async function keycloakLogin(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  storagePath: string,
  context: import('@playwright/test').BrowserContext
): Promise<void> {
  const roleLabel = path.basename(storagePath, '.json')
  log(`Logging in as ${email} (${roleLabel})...`)

  attachAuthRequestLogging(context)

  await page.goto(`${baseURL}/app/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  let currentUrl = page.url()
  let activePage = page

  if (currentUrl.includes('/login')) {
    log(`On app login page, clicking Sign in with Keycloak: ${currentUrl}`)
    const keycloakButton = page.getByRole('button', { name: /keycloak/i }).first()
    const keycloakLink = page.getByRole('link', { name: /keycloak/i }).first()
    const keycloakFallback = page.locator('button:has-text("Keyclo")').first()
    let popup: import('@playwright/test').Page | null = null
    context.once('page', (p) => {
      popup = p
    })
    if (await keycloakButton.isVisible().catch(() => false)) {
      await keycloakButton.click()
    } else if (await keycloakLink.isVisible().catch(() => false)) {
      await keycloakLink.click()
    } else if (await keycloakFallback.isVisible().catch(() => false)) {
      await keycloakFallback.click()
    } else {
      await dumpFailureDiagnostics(page, roleLabel)
      throw new Error(
        `Auth setup failed (role=${roleLabel}): on /login but no "Sign in with Keycloak" button/link found (tried getByRole(button), getByRole(link), button:has-text("Keyclo")).`
      )
    }
    await new Promise((r) => setTimeout(r, 1000))
    if (popup) {
      activePage = popup
      await activePage.waitForLoadState('domcontentloaded')
    } else {
      await page
        .waitForURL(
          (url) => {
            const h = typeof url === 'string' ? url : url.href
            return (
              (h.includes('/realms/') && h.includes('/protocol/openid-connect/auth')) ||
              !h.includes('/login')
            )
          },
          { timeout: REDIRECT_TIMEOUT_MS }
        )
        .catch(() => {})
      activePage = page
    }
    currentUrl = activePage.url()
    if (currentUrl.includes('/login') && !currentUrl.includes('/realms/')) {
      await dumpFailureDiagnostics(activePage, roleLabel)
      throw new Error(
        `Auth setup failed (role=${roleLabel}): after clicking Sign in with Keycloak still on /login. Keycloak may be unreachable or auth redirect URL misconfigured. URL: ${currentUrl}`
      )
    }
  }

  currentUrl = activePage.url()
  const onKeycloak =
    currentUrl.includes(KEYCLOAK_REALM_PATH) ||
    (currentUrl.includes('/realms/') && currentUrl.includes('Supplify'))

  if (onKeycloak) {
    log(`On Keycloak: ${currentUrl}`)
    const usernameField = activePage
      .locator('#username')
      .or(activePage.locator('input[name="username"]'))
    const passwordField = activePage
      .locator('#password')
      .or(activePage.locator('input[name="password"]'))
    await usernameField.waitFor({ state: 'visible', timeout: 15000 })
    await passwordField.waitFor({ state: 'visible', timeout: 5000 })
    await usernameField.fill(email)
    await passwordField.fill(password)
    const submitBtn = activePage
      .locator('button[type="submit"]')
      .or(activePage.locator('#kc-login'))
    await submitBtn.click()

    const baseURLRegex = new RegExp(
      '^' + baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/?$/, '') + '(/|$)'
    )
    await activePage.waitForURL(baseURLRegex, { timeout: REDIRECT_TIMEOUT_MS })
    log(`Back on app: ${activePage.url()}`)
  }

  await new Promise((r) => setTimeout(r, 2000))
  const finalUrl = activePage.url()

  if (finalUrl.includes('/login') || finalUrl.includes('expired=true')) {
    await dumpFailureDiagnostics(activePage, roleLabel)
    const hint = currentUrl.startsWith('http://localhost:8080')
      ? ' Keycloak on http://localhost:8080 sets Secure cookies; browsers may not persist them on HTTP. Use HTTPS for Keycloak or run Keycloak with same-site cookie settings for localhost.'
      : ''
    throw new Error(
      `Auth setup failed (role=${roleLabel}): ended on /login or expired=true. URL: ${finalUrl}.${hint}`
    )
  }

  if (finalUrl.includes('/realms/') || finalUrl.includes('keycloak')) {
    await dumpFailureDiagnostics(activePage, roleLabel)
    throw new Error(
      `Auth setup failed (role=${roleLabel}): still on Keycloak after submit. URL: ${finalUrl}.`
    )
  }

  const sidebar = activePage.getByTestId(SIDEBAR_TESTID)
  await sidebar.waitFor({ state: 'visible', timeout: 15000 }).catch(async () => {
    await dumpFailureDiagnostics(activePage, roleLabel)
    const nowUrl = activePage.url()
    if (nowUrl.includes('/login') || nowUrl.includes('expired=true')) {
      throw new Error(
        `Auth setup failed (role=${roleLabel}): session invalid, redirected to login. URL: ${nowUrl}.`
      )
    }
    throw new Error(
      `Auth setup failed (role=${roleLabel}): sidebar (data-testid="${SIDEBAR_TESTID}") did not appear. URL: ${nowUrl}.`
    )
  })
  log(`Sidebar visible at ${activePage.url()}`)

  const authMePromise = activePage.waitForResponse(
    (res) => {
      const u = res.url()
      return u.includes('/auth/me') || u.endsWith('/auth/me')
    },
    { timeout: 15000 }
  )
  await activePage.reload({ waitUntil: 'domcontentloaded' })
  try {
    const authMeRes = await authMePromise
    if (authMeRes.status() === 401) {
      await dumpFailureDiagnostics(activePage, roleLabel)
      throw new Error(
        `Auth setup failed (role=${roleLabel}): /auth/me returned 401. Session invalid or API rejected token. Fail fast.`
      )
    }
    if (authMeRes.status() !== 200) {
      await dumpFailureDiagnostics(activePage, roleLabel)
      throw new Error(
        `Auth setup failed (role=${roleLabel}): /auth/me returned ${authMeRes.status()}, expected 200.`
      )
    }
    log(`/auth/me returned 200 for ${roleLabel}`)
  } catch (err) {
    if (err instanceof Error && (err.message.includes('401') || err.message.includes('auth/me')))
      throw err
    await dumpFailureDiagnostics(activePage, roleLabel)
    throw new Error(
      `Auth setup failed (role=${roleLabel}): /auth/me did not return 200 within 15s after reload. Session may be invalid or API unreachable.`
    )
  }

  // Validate before saving: not on Keycloak, not on /login or expired
  const urlBeforeSave = activePage.url()
  if (urlBeforeSave.includes('/realms/') || urlBeforeSave.includes('keycloak')) {
    await dumpFailureDiagnostics(activePage, roleLabel)
    throw new Error(
      `Auth setup failed (role=${roleLabel}): cannot save storageState while still on Keycloak. URL: ${urlBeforeSave}.`
    )
  }
  if (urlBeforeSave.includes('/login') || urlBeforeSave.includes('expired=true')) {
    await dumpFailureDiagnostics(activePage, roleLabel)
    throw new Error(
      `Auth setup failed (role=${roleLabel}): cannot save storageState on /login or expired. URL: ${urlBeforeSave}.`
    )
  }

  const cookies = await context.cookies()
  if (!cookies.length) {
    await dumpFailureDiagnostics(activePage, roleLabel)
    throw new Error(
      `Auth setup failed (role=${roleLabel}): no cookies in context before save. Keycloak Secure+SameSite=None cookies are not sent over HTTP; use HTTPS for Keycloak or adjust cookie settings for localhost.`
    )
  }

  const patched = patchSecureCookiesForLocalHttp(cookies)
  await context.clearCookies()
  await context.addCookies(patched)

  fs.mkdirSync(path.dirname(storagePath), { recursive: true })
  await context.storageState({ path: storagePath })

  let saved = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
  if (!saved?.cookies?.length) {
    await dumpFailureDiagnostics(activePage, roleLabel)
    throw new Error(
      `Auth setup failed (role=${roleLabel}): storageState has no cookies after save. Refusing invalid auth files.`
    )
  }
  if (!saved?.origins?.length) {
    saved = { ...saved, origins: [{ origin: APP_ORIGIN, localStorage: [] }] }
    fs.writeFileSync(storagePath, JSON.stringify(saved))
    log(`Injected origin ${APP_ORIGIN} for ${storagePath}`)
  }
  log(`Saved storage to ${storagePath}`)
}

const STORAGE_KEYS: Array<{ role: keyof typeof TEST_USERS; pathsKey: string }> = [
  { role: 'admin', pathsKey: 'admin' },
  { role: 'restaurant', pathsKey: 'restaurant' },
  { role: 'supplier', pathsKey: 'supplier' },
  { role: 'restaurant', pathsKey: 'nightly-restaurant' },
]

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

  const authCheck = await authAvailableAsync()
  if (!authCheck.available) {
    throw new Error(
      `Auth setup aborted: ${authCheck.reason}. Start Keycloak and the API, then re-run e2e:playwright.`
    )
  }

  let browser
  try {
    browser = await chromium.launch()
  } catch (e) {
    throw new Error(
      `Auth setup aborted: browser failed to launch. ${e instanceof Error ? e.message : String(e)}`
    )
  }

  log(`baseURL=${baseURL} apiURL=${apiURL}`)
  let anyAuthOk = false
  for (const { role, pathsKey } of STORAGE_KEYS) {
    const user = TEST_USERS[role]
    const storagePath = path.join(authDir, `${pathsKey}.json`)
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page = await context.newPage()
    try {
      await keycloakLogin(page, user.email, user.password, storagePath, context)
      anyAuthOk = true
    } catch (err) {
      await dumpFailureDiagnostics(page, pathsKey)
      const finalUrl = page.url()
      throw new Error(
        `Auth setup failed: role=${pathsKey}, final URL=${finalUrl}. ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      await page.close().catch(() => {})
      await context.close().catch(() => {})
    }
  }
  if (anyAuthOk) {
    fs.writeFileSync(path.join(authDir, '.auth-ok'), '1')
    log('Wrote .auth-ok')
  }

  await browser.close()
}
