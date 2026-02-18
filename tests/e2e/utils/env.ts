/**
 * E2E environment and URLs. Prefer env vars, then probed URLs (from probe-urls.mjs), then defaults.
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, '..', '.auth')

function readProbedUrl(fileName: string): string | null {
  try {
    const p = path.join(authDir, fileName)
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim() || null
  } catch {
    /* ignore */
  }
  return null
}

export const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.WEB_ORIGIN ||
  readProbedUrl('.web-base-url') ||
  'http://localhost:5173'
export const apiURL =
  process.env.PLAYWRIGHT_API_URL ||
  process.env.VITE_API_URL ||
  readProbedUrl('.api-base-url') ||
  'http://127.0.0.1:4000'

export function getBaseURL(): string {
  return baseURL
}

export function getApiURL(): string {
  return apiURL
}
