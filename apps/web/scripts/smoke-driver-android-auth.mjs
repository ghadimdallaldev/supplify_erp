import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const androidRoot = join(webRoot, 'android')
const config = JSON.parse(
  readFileSync(join(androidRoot, 'app', 'src', 'main', 'assets', 'capacitor.config.json'), 'utf8')
)
const packageName = config.appId
const hostedAppUrl = config.server?.url
const authHosts = config.server?.allowNavigation ?? []
const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb'
const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean)
const pathEntries = (process.env.PATH ?? '').split(delimiter)
const adbPath =
  [
    ...sdkRoots.map((root) => join(root, 'platform-tools', adbName)),
    ...pathEntries.map((root) => join(root, adbName)),
  ].find(existsSync) ?? adbName
const serialArgs = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : []
const devtoolsPort = 9222

if (!packageName || !hostedAppUrl || authHosts.length === 0) {
  throw new Error('Sync a hosted Android environment before running the auth smoke test.')
}

function runAdb(args, options = {}) {
  const result = spawnSync(adbPath, [...serialArgs, ...args], {
    cwd: androidRoot,
    encoding: 'utf8',
    timeout: options.timeout ?? 30_000,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `adb ${args.join(' ')} failed`).trim())
  }
  return result.stdout.trim()
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitFor(description, action, timeout = 30_000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const result = await action()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }
  throw new Error(
    `Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`
  )
}

function assertSingleDevice() {
  const devices = runAdb(['devices'])
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => /\tdevice$/.test(line))
  if (devices.length !== 1 && !process.env.ANDROID_SERIAL) {
    throw new Error(
      `Expected exactly one connected Android target, found ${devices.length}. Set ANDROID_SERIAL when using multiple devices.`
    )
  }
}

function assertDebuggablePackage() {
  const packageDump = runAdb(['shell', 'dumpsys', 'package', packageName])
  if (!/\bDEBUGGABLE\b/.test(packageDump)) {
    throw new Error(
      `The installed ${packageName} package is not debuggable. Install app-debug.apk before running this smoke test.`
    )
  }
}

async function connectToWebView() {
  const pid = await waitFor('the driver process', async () =>
    runAdb(['shell', 'pidof', packageName])
  )
  runAdb(['forward', `tcp:${devtoolsPort}`, `localabstract:webview_devtools_remote_${pid.trim()}`])
  const page = await waitFor('the driver WebView debugger', async () => {
    const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json`)
    if (!response.ok) return null
    const pages = await response.json()
    return pages.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl)
  })
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 1
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const callback = pending.get(message.id)
    if (!callback) return
    pending.delete(message.id)
    if (message.error) callback.reject(new Error(message.error.message))
    else callback.resolve(message.result)
  })
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const response = await request('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || 'WebView JavaScript evaluation failed')
    }
    return response.result?.value
  }
  await request('Runtime.enable')
  return { evaluate, close: () => socket.close() }
}

async function verifyFlow(name, clickExpression, expectedPath) {
  runAdb(['shell', 'pm', 'clear', packageName])
  runAdb(['shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`], {
    timeout: 60_000,
  })
  const session = await connectToWebView()
  try {
    await waitFor('the hosted driver login page', async () => {
      const href = await session.evaluate('window.location.href')
      return href?.startsWith(hostedAppUrl) && href
    })
    await waitFor(`the ${name} control`, () => session.evaluate(clickExpression))
    const authUrl = await waitFor(`${name} to reach Keycloak`, async () => {
      const href = await session.evaluate('window.location.href')
      if (!href) return null
      const url = new URL(href)
      return authHosts.includes(url.hostname) ? href : null
    })
    const parsed = new URL(authUrl)
    if (!parsed.pathname.includes(expectedPath)) {
      throw new Error(`${name} reached unexpected URL: ${authUrl}`)
    }
    console.log(`PASS ${name}: ${parsed.origin}${parsed.pathname}`)
  } finally {
    session.close()
    runAdb(['forward', '--remove', `tcp:${devtoolsPort}`])
  }
}

assertSingleDevice()
assertDebuggablePackage()
await verifyFlow(
  'Sign in',
  '(() => { const button = document.querySelector(\'[data-testid="login-button"]\'); if (!button) return false; button.click(); return true })()',
  '/protocol/openid-connect/auth'
)
await verifyFlow(
  'Register',
  "(() => { const button = Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === 'Create account'); if (!button) return false; button.click(); return true })()",
  '/registrations'
)
