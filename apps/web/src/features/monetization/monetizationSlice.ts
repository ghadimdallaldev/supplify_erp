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

type MonetizationState = {
  open: boolean
  type: MonetizationBlockType
  payload: LimitExceededPayload | FeatureNotAvailablePayload | null
  /** Count of blocks in last 7 days (for proactive nudge) */
  blockedCountLast7d: number
}

const BLOCKED_KEY = 'supplify_monetization_blocked'
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function loadBlockedTimestamps(): number[] {
  try {
    const raw = localStorage.getItem(BLOCKED_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function pushBlockedTimestamp(): number[] {
  const now = Date.now()
  const timestamps = loadBlockedTimestamps().filter((t) => now - t < WINDOW_MS)
  timestamps.push(now)
  try {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(timestamps))
  } catch {
    // ignore localStorage errors (e.g. private mode)
  }
  return timestamps
}

const initialState: MonetizationState = {
  open: false,
  type: null,
  payload: null,
  blockedCountLast7d: 0,
}

const slice = createSlice({
  name: 'monetization',
  initialState,
  reducers: {
    showMonetizationBlock(
      state,
      action: {
        payload: { type: 'limit' | 'feature'; payload: LimitExceededPayload | FeatureNotAvailablePayload }
      }
    ) {
      state.open = true
      state.type = action.payload.type
      state.payload = action.payload.payload
      const timestamps = pushBlockedTimestamp()
      state.blockedCountLast7d = timestamps.length
    },
    closeMonetizationModal(state) {
      state.open = false
      state.type = null
      state.payload = null
    },
    refreshBlockedCount(state) {
      const now = Date.now()
      const timestamps = loadBlockedTimestamps().filter((t) => now - t < WINDOW_MS)
      state.blockedCountLast7d = timestamps.length
    },
  },
})

export const { showMonetizationBlock, closeMonetizationModal, refreshBlockedCount } = slice.actions
export default slice.reducer
