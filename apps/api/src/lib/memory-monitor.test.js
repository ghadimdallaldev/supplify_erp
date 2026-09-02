import { describe, it, expect } from 'vitest'
import { getMemorySnapshot, shouldExposeMemoryOnHealth } from './memory-monitor.js'

describe('memory-monitor', () => {
  it('returns numeric memory fields in MB', () => {
    const snap = getMemorySnapshot()
    expect(snap.rssMb).toBeGreaterThan(0)
    expect(snap.heapUsedMb).toBeGreaterThan(0)
    expect(snap.heapTotalMb).toBeGreaterThanOrEqual(snap.heapUsedMb)
  })

  it('does not expose health memory in test env', () => {
    expect(shouldExposeMemoryOnHealth()).toBe(false)
  })
})
