/** Features removed from the product; hide from plan banners and upgrade comparisons. */
export const REMOVED_FEATURE_KEYS = new Set(['approvals_budgets'])

export function isRemovedFeatureKey(key: string): boolean {
  return REMOVED_FEATURE_KEYS.has(key)
}
