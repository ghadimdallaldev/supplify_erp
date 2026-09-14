import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const staticDir = join(process.cwd(), 'static')

describe('PWA service worker', () => {
  it('exists and does not cache API routes', () => {
    const swPath = join(staticDir, 'sw.js')
    expect(existsSync(swPath)).toBe(true)

    const source = readFileSync(swPath, 'utf8')
    expect(source).toContain('/api/')
    expect(source).toContain('/auth/')
    expect(source).toContain('offline.html')
    expect(source).not.toMatch(/cache\.put\([^)]*\/api\//)
  })

  it('offline fallback page exists', () => {
    expect(existsSync(join(staticDir, 'offline.html'))).toBe(true)
  })
})
