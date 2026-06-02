import { describe, expect, it, beforeEach, afterEach } from 'vitest'

describe('supplifyModel', () => {
  const prev = process.env.SUPPLIFY_MODEL_VERSION

  afterEach(() => {
    if (prev == null) delete process.env.SUPPLIFY_MODEL_VERSION
    else process.env.SUPPLIFY_MODEL_VERSION = prev
  })

  it('defaults to v1 when env is missing', async () => {
    delete process.env.SUPPLIFY_MODEL_VERSION
    const { getSupplifyModelVersion, isSupplifyV1, isSupplifyV2 } = await import(
      './supplifyModel.js'
    )
    expect(getSupplifyModelVersion()).toBe('v1')
    expect(isSupplifyV1()).toBe(true)
    expect(isSupplifyV2()).toBe(false)
  })

  it('defaults to v1 when env is invalid', async () => {
    process.env.SUPPLIFY_MODEL_VERSION = 'v99'
    const { getSupplifyModelVersion } = await import('./supplifyModel.js')
    expect(getSupplifyModelVersion()).toBe('v1')
  })

  it('returns v2 when env is v2', async () => {
    process.env.SUPPLIFY_MODEL_VERSION = 'v2'
    const { getSupplifyModelVersion, isSupplifyV2 } = await import('./supplifyModel.js')
    expect(getSupplifyModelVersion()).toBe('v2')
    expect(isSupplifyV2()).toBe(true)
  })

  it('exposes business model config for active version', async () => {
    process.env.SUPPLIFY_MODEL_VERSION = 'v2'
    const { getSupplifyBusinessModelConfig } = await import('./supplifyModel.js')
    const cfg = getSupplifyBusinessModelConfig()
    expect(cfg.version).toBe('v2')
    expect(cfg.positioning?.tagline).toContain('Supplier-first')
  })
})
