import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const manifestPath = join(process.cwd(), 'static', 'manifest.webmanifest')

describe('PWA manifest', () => {
  it('exists with required install fields', () => {
    const raw = readFileSync(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as Record<string, unknown>

    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBeTruthy()
    expect(manifest.background_color).toBeTruthy()

    const icons = manifest.icons as Array<{ src: string; sizes: string; type?: string }>
    expect(Array.isArray(icons)).toBe(true)
    expect(icons.some((icon) => icon.sizes === '192x192')).toBe(true)
    expect(icons.some((icon) => icon.sizes === '512x512')).toBe(true)
  })
})
