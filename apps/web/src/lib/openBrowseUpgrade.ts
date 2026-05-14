import type { AppDispatch } from '../store'
import { showMonetizationBlock } from '../features/monetization/monetizationSlice'

/** Open the compare-plans upgrade modal (voluntary upgrade, not a blocked feature). */
export function openBrowseUpgrade(
  dispatch: AppDispatch,
  options?: { currentPlan?: string | null; upgradeUrl?: string }
) {
  dispatch(
    showMonetizationBlock({
      type: 'feature',
      payload: {
        featureKey: 'upgrade_prompt',
        currentPlan: options?.currentPlan ?? null,
        requiredPlan: null,
        recommendedPlans: [],
        upgradeUrl: options?.upgradeUrl ?? '/app/settings?tab=subscription',
      },
    })
  )
}
