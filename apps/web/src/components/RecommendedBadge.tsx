import { Badge } from './ui/badge'

type RecommendedBadgeProps = {
  /** Plan code for this row/card (e.g. "gold") */
  planCode: string
  /** Recommended plan code from /api/subscriptions/recommendation */
  recommendedPlanCode: string | null | undefined
  /** When true, use subtle style (e.g. current plan is best) */
  subtle?: boolean
}

/**
 * Shows a "Recommended" badge when this plan matches the recommendation API result.
 * Reuse existing recommendation query/cache; parent passes recommendedPlanCode.
 */
export function RecommendedBadge({ planCode, recommendedPlanCode, subtle }: RecommendedBadgeProps) {
  const code = (planCode || '').toLowerCase()
  const rec = (recommendedPlanCode || '').toLowerCase()
  if (!rec || code !== rec) return null

  return (
    <Badge
      variant={subtle ? 'secondary' : 'default'}
      className={
        subtle
          ? 'text-xs font-medium bg-amber-100 text-amber-800 border-amber-200'
          : 'text-xs font-medium bg-primary text-primary-foreground'
      }
    >
      Recommended
    </Badge>
  )
}
