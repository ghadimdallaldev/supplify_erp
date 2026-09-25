import { describe, expect, it } from 'vitest'
import { getModifierSelectionError } from './consumer-menu.service.js'

describe('getModifierSelectionError', () => {
  it('rejects a minimum that guests cannot reach', () => {
    expect(getModifierSelectionError(3, 1)).toMatch(/minimum/i)
  })

  it('accepts a normal required choice', () => {
    expect(getModifierSelectionError(1, 1)).toBeNull()
  })
})
