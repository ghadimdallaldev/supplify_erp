import type { ComponentType } from 'react'
import { EmptyState, LoadingState, Screen } from '../../components/ui'
import { useEntitlementMap } from '../../hooks/useEntitlements'

export function withFeatureGate<P extends object>(
  Component: ComponentType<P>,
  featureKey: string,
  featureName: string
): ComponentType<P> {
  function FeatureGatedScreen(props: P) {
    const { isEnabled, isLoading } = useEntitlementMap()

    if (isLoading) return <LoadingState message="Checking your plan…" />
    if (!isEnabled(featureKey)) {
      return (
        <Screen>
          <EmptyState
            icon="lock-closed-outline"
            title={`${featureName} is not in this plan`}
            message="Open Plan & features from More to review the capabilities available to this workspace."
          />
        </Screen>
      )
    }

    return <Component {...props} />
  }

  FeatureGatedScreen.displayName = `FeatureGate(${featureName})`
  return FeatureGatedScreen
}
