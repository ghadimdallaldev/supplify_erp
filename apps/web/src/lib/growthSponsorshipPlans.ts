/** Restaurant plan tiers suppliers may gift via sponsorship (platform-configurable subset). */
export const SPONSORSHIP_GIFT_PLAN_KEYS = ['silver', 'gold', 'platinum'] as const

/** All plan tiers referenced in admin sponsorship limit settings. */
export const SPONSORSHIP_PLAN_KEYS = [...SPONSORSHIP_GIFT_PLAN_KEYS, 'enterprise'] as const

export type SponsorshipPlanKey = (typeof SPONSORSHIP_PLAN_KEYS)[number]
export type SponsorshipGiftPlanKey = (typeof SPONSORSHIP_GIFT_PLAN_KEYS)[number]

export const SPONSORSHIP_PLAN_LABELS: Record<SponsorshipPlanKey, string> = {
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  enterprise: 'Enterprise',
}

/** Platform default when supplier growth metrics omit eligibleSponsorPlans. */
export const DEFAULT_ELIGIBLE_SPONSOR_PLANS: SponsorshipGiftPlanKey[] = [
  ...SPONSORSHIP_GIFT_PLAN_KEYS,
]

const PLAN_RANK: Record<string, number> = {
  silver: 0,
  gold: 1,
  platinum: 2,
  enterprise: 3,
}

export function normalizeEligibleSponsorPlans(
  plans: string[] | undefined | null
): SponsorshipGiftPlanKey[] {
  const normalized = (plans ?? DEFAULT_ELIGIBLE_SPONSOR_PLANS).map((p) => p.toLowerCase())
  const eligible = SPONSORSHIP_GIFT_PLAN_KEYS.filter((key) => normalized.includes(key))
  return eligible.length > 0 ? eligible : [...DEFAULT_ELIGIBLE_SPONSOR_PLANS]
}

/** Default gift tier: lowest eligible paid restaurant plan. */
export function lowestEligibleSponsorPlan(
  plans: string[] | undefined | null
): SponsorshipGiftPlanKey {
  const eligible = normalizeEligibleSponsorPlans(plans)
  return [...eligible].sort((a, b) => (PLAN_RANK[a] ?? 99) - (PLAN_RANK[b] ?? 99))[0]
}
