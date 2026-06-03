import { describe, expect, it } from 'vitest'

/** Mirrors RTK-unwrapped GET /api/admin-dashboard/activity payload. */
export interface AdminActivityResponse {
  events: Array<{
    id: string
    event_type: string
    title: string
    subtitle?: string | null
    occurred_at: string
  }>
  total: number
  partial?: boolean
  failedSources?: string[]
}

export function hasActivityEvents(data: AdminActivityResponse | undefined): boolean {
  return Boolean(data?.events?.length)
}

export function shouldShowActivityEmptyState(
  data: AdminActivityResponse | undefined,
  opts: { isError: boolean; isLoading: boolean }
): boolean {
  if (opts.isLoading || opts.isError) return false
  return !hasActivityEvents(data)
}

describe('admin activity feed UI helpers', () => {
  it('hasActivityEvents is true when events exist', () => {
    expect(
      hasActivityEvents({
        events: [{ id: '1', event_type: 'order_placed', title: 'x', occurred_at: '' }],
        total: 1,
      })
    ).toBe(true)
  })

  it('shouldShowActivityEmptyState is false on API error', () => {
    expect(shouldShowActivityEmptyState(undefined, { isError: true, isLoading: false })).toBe(false)
  })

  it('shouldShowActivityEmptyState is true only when loaded with no events', () => {
    expect(
      shouldShowActivityEmptyState({ events: [], total: 0 }, { isError: false, isLoading: false })
    ).toBe(true)
  })
})
