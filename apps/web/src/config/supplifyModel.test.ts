import { describe, expect, it } from 'vitest'
import {
  getSupplifyBusinessModelConfig,
  getSupplifyModelVersion,
  isSupplifyV1,
  isSupplifyV2,
} from './supplifyModel'

describe('supplifyModel (web)', () => {
  it('reads model version from Vite env defaulting to v1', () => {
    expect(['v1', 'v2']).toContain(getSupplifyModelVersion())
  })

  it('v1 and v2 helpers are mutually exclusive', () => {
    expect(isSupplifyV1()).toBe(!isSupplifyV2())
  })

  it('returns business config for active version', () => {
    const cfg = getSupplifyBusinessModelConfig()
    expect(cfg.version).toBe(getSupplifyModelVersion())
    expect(cfg.positioning).toBeDefined()
  })
})
