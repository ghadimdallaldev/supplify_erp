/**
 * Probes web and API URLs before Playwright runs. Writes reachability and
 * working URLs to tests/e2e/.auth so tests don't all skip when servers are
 * on different ports (e.g. Vite on 5174). Run before playwright test.
 */
import fs from 'fs'
import path from 'path'

const cwd = process.cwd()
const authDir = path.join(cwd, 'tests', 'e2e', '.auth')

const webCandidates = [
  process.env.PLAYWRIGHT_BASE_URL || process.env.WEB_ORIGIN,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
].filter(Boolean)

const apiCandidates = [
  process.env.PLAYWRIGHT_API_URL || process.env.VITE_API_URL,
  'http://localhost:4000',
  'http://127.0.0.1:4000',
].filter(Boolean)

async function fetchOk(url, timeout = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    return res.ok || res.status === 401 || res.status === 404 || res.status < 500
  } catch {
    return false
  }
}

async function main() {
  fs.mkdirSync(authDir, { recursive: true })

  let webUrl = ''
  for (const url of webCandidates) {
    if (await fetchOk(url)) {
      webUrl = url
      break
    }
  }
  if (webUrl) {
    fs.writeFileSync(path.join(authDir, '.web-reachable'), '1')
    fs.writeFileSync(path.join(authDir, '.web-base-url'), webUrl.trim())
  }

  let apiUrl = ''
  for (const url of apiCandidates) {
    if (await fetchOk(url)) {
      apiUrl = url
      break
    }
  }
  if (apiUrl) {
    fs.writeFileSync(path.join(authDir, '.api-reachable'), '1')
    fs.writeFileSync(path.join(authDir, '.api-base-url'), apiUrl.trim())
  }
}

main().catch((err) => {
  console.error('probe-urls:', err)
  process.exit(1)
})
