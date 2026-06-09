export type UsageStatus = 'healthy' | 'near_limit' | 'over_limit' | 'unlimited' | 'unknown'

export function computeUsageStatus(used: number, limit: number | null | undefined): UsageStatus {
  if (limit === -1) return 'unlimited'
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return 'unknown'
  if (used > limit) return 'over_limit'
  if (used >= limit * 0.8) return 'near_limit'
  return 'healthy'
}

export function computeWorstUsageStatus(statuses: UsageStatus[]): UsageStatus {
  const priority: UsageStatus[] = ['over_limit', 'near_limit', 'healthy', 'unlimited', 'unknown']
  for (const status of priority) {
    if (statuses.includes(status)) return status
  }
  return 'unknown'
}

export function usagePercent(used: number, limit: number | null | undefined): number {
  if (limit === -1 || limit == null || limit <= 0) return 0
  return Math.min(100, (used / limit) * 100)
}
