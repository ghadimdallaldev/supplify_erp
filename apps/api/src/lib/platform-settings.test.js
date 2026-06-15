import { describe, expect, it } from 'vitest'
import {
  clampFreeTrialDays,
  FREE_TRIAL_MAX_DAYS,
  FREE_TRIAL_MIN_DAYS,
} from './platform-settings.js'

describe('clampFreeTrialDays', () => {
  it('clamps below minimum to 7', () => {
    expect(clampFreeTrialDays(1)).toBe(FREE_TRIAL_MIN_DAYS)
  })

  it('clamps above maximum to 90', () => {
    expect(clampFreeTrialDays(120)).toBe(FREE_TRIAL_MAX_DAYS)
  })

  it('passes through valid values', () => {
    expect(clampFreeTrialDays(30)).toBe(30)
  })

  it('uses fallback when days is not a number', () => {
    expect(clampFreeTrialDays('x', 30)).toBe(30)
  })
})
