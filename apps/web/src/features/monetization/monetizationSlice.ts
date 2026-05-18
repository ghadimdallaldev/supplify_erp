import { createSlice } from '@reduxjs/toolkit'

export type MonetizationBlockType = 'limit' | 'feature' | null

export type LimitExceededPayload = {
  limitKey: string
  limitValue: number
  currentUsage: number
  currentPlan: string | null
  recommendedPlans: string[]
  upgradeUrl?: string
  requested?: number
}

export type FeatureNotAvailablePayload = {
  featureKey: string
  currentPlan: string | null
  requiredPlan: string | null
  recommendedPlans: string[]
  upgradeUrl?: string
}

export type RecentBlockedSummary = {
  limitKeys: Array<{ key: string; count: number }>
  featureKeys: Array<{ key: string; count: number }>
}

type BlockedEvent = {
  at: number
  limitKey?: string
  featureKey?: string
}

type MonetizationState = {
  open: boolean
  /** Bumped on each open so Radix Dialog remounts reliably after close */
  openRevision: number
  type: MonetizationBlockType
  payload: LimitExceededPayload | FeatureNotAvailablePayload | null
  /** Count of blocks in last 7 days (for proactive nudge) */
  blockedCountLast7d: number
  /** Which limits/features were blocked most often in the last 7 days */
  recentBlockedSummary: RecentBlockedSummary
}

const BLOCKED_KEY = 'supplify_monetization_blocked'
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** Voluntary "compare plans" opens — not real plan blocks */
const IGNORED_FEATURE_KEYS = new Set(['upgrade_prompt'])

const emptySummary = (): RecentBlockedSummary => ({
  limitKeys: [],
  featureKeys: [],
})

function loadBlockedEvents(): BlockedEvent[] {
  try {
    const raw = localStorage.getItem(BLOCKED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    if (parsed.length > 0 && typeof parsed[0] === 'number') {
      return (parsed as number[]).map((at) => ({ at }))
    }
    return parsed.filter(
      (e: unknown): e is BlockedEvent => Boolean(e) && typeof (e as BlockedEvent).at === 'number'
    )
  } catch {
    return []
  }
}

function saveBlockedEvents(events: BlockedEvent[]) {
  try {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(events))
  } catch {
    // ignore localStorage errors (e.g. private mode)
  }
}

function summarizeBlocked(events: BlockedEvent[]): {
  count: number
  summary: RecentBlockedSummary
  events: BlockedEvent[]
} {
  const now = Date.now()
  const recent = events.filter((e) => now - e.at < WINDOW_MS)

  const trackable = recent.filter(
    (e) => e.limitKey || (e.featureKey && !IGNORED_FEATURE_KEYS.has(e.featureKey))
  )

  const limitCounts = new Map<string, number>()
  const featureCounts = new Map<string, number>()
  for (const e of trackable) {
    if (e.limitKey) {
      limitCounts.set(e.limitKey, (limitCounts.get(e.limitKey) ?? 0) + 1)
    }
    if (e.featureKey && !IGNORED_FEATURE_KEYS.has(e.featureKey)) {
      featureCounts.set(e.featureKey, (featureCounts.get(e.featureKey) ?? 0) + 1)
    }
  }

  const byCount = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count]) => ({ key, count }))

  return {
    count: trackable.length,
    summary: {
      limitKeys: byCount(limitCounts),
      featureKeys: byCount(featureCounts),
    },
    events: recent,
  }
}

function pushBlockedEvent(meta: { limitKey?: string; featureKey?: string }): {
  count: number
  summary: RecentBlockedSummary
} {
  const now = Date.now()
  const existing = loadBlockedEvents().filter((e) => now - e.at < WINDOW_MS)
  existing.push({
    at: now,
    ...(meta.limitKey ? { limitKey: meta.limitKey } : {}),
    ...(meta.featureKey ? { featureKey: meta.featureKey } : {}),
  })
  const { count, summary, events } = summarizeBlocked(existing)
  saveBlockedEvents(events)
  return { count, summary }
}

function refreshBlockedFromStorage(): { count: number; summary: RecentBlockedSummary } {
  const { count, summary, events } = summarizeBlocked(loadBlockedEvents())
  saveBlockedEvents(events)
  return { count, summary }
}

const initialRefresh = refreshBlockedFromStorage()

const initialState: MonetizationState = {
  open: false,
  openRevision: 0,
  type: null,
  payload: null,
  blockedCountLast7d: initialRefresh.count,
  recentBlockedSummary: initialRefresh.summary,
}

const slice = createSlice({
  name: 'monetization',
  initialState,
  reducers: {
    showMonetizationBlock(
      state,
      action: {
        payload: {
          type: 'limit' | 'feature'
          payload: LimitExceededPayload | FeatureNotAvailablePayload
        }
      }
    ) {
      state.open = true
      state.openRevision += 1
      state.type = action.payload.type
      state.payload = action.payload.payload

      const p = action.payload.payload
      const isVoluntaryBrowse =
        action.payload.type === 'feature' &&
        p &&
        'featureKey' in p &&
        p.featureKey === 'upgrade_prompt'

      if (!isVoluntaryBrowse) {
        const meta =
          action.payload.type === 'limit' && p && 'limitKey' in p
            ? { limitKey: p.limitKey }
            : action.payload.type === 'feature' && p && 'featureKey' in p
              ? { featureKey: p.featureKey }
              : {}

        const { count, summary } = pushBlockedEvent(meta)
        state.blockedCountLast7d = count
        state.recentBlockedSummary = summary
      }
    },
    closeMonetizationModal(state) {
      state.open = false
    },
    resetMonetizationModal(state) {
      state.open = false
      state.type = null
      state.payload = null
    },
    refreshBlockedCount(state) {
      const { count, summary } = refreshBlockedFromStorage()
      state.blockedCountLast7d = count
      state.recentBlockedSummary = summary
    },
  },
})

export const {
  showMonetizationBlock,
  closeMonetizationModal,
  resetMonetizationModal,
  refreshBlockedCount,
} = slice.actions
export default slice.reducer
