import type { AppDispatch } from '../store'
import { showMonetizationBlock } from '../features/monetization/monetizationSlice'

/** Open the compare-plans upgrade modal (voluntary upgrade, not a blocked feature). */
export function openBrowseUpgrade(
  dispatch: AppDispatch,
  options?: { currentPlan?: string | null; upgradeUrl?: string }
) {
  const action = showMonetizationBlock({
    type: 'feature',
    payload: {
      featureKey: 'upgrade_prompt',
      currentPlan: options?.currentPlan ?? null,
      requiredPlan: null,
      recommendedPlans: [],
      upgradeUrl: options?.upgradeUrl ?? '/app/settings?tab=subscription',
    },
  })
  // Defer so the button click that opens the modal is not treated as an outside dismiss.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => dispatch(action))
  } else {
    setTimeout(() => dispatch(action), 0)
  }
}
