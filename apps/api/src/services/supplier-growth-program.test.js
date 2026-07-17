import { describe, expect, it } from 'vitest'
import {
  clampFreeTrialDays,
  FREE_TRIAL_MAX_DAYS,
  FREE_TRIAL_MIN_DAYS,
} from '../lib/platform-settings.js'

describe('referral program platform trial defaults', () => {
  it('defaults clamp to 30 days within 7-90 range', () => {
    expect(clampFreeTrialDays(30)).toBe(30)
    expect(FREE_TRIAL_MIN_DAYS).toBe(7)
    expect(FREE_TRIAL_MAX_DAYS).toBe(90)
  })
})
