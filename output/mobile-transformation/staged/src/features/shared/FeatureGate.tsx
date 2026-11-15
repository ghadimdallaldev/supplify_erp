import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import type { ComponentType } from "react";
import { EmptyState, LoadingState, Screen } from "../../components/ui";
import { useEntitlementMap } from "../../hooks/useEntitlements";

export function withFeatureGate<P extends object>(
  Component: ComponentType<P>,
  featureKey: string,
  featureName: string,
): ComponentType<P> {
  function FeatureGatedScreen(props: P) {
    useUiLocale();

    const { isEnabled, isLoading } = useEntitlementMap();

    if (isLoading)
      return <LoadingState message={uiCopy("Checking your plan…")} />;
    if (!isEnabled(featureKey)) {
      return (
        <Screen>
          <EmptyState
            icon="lock-closed-outline"
            title={uiCopy("{{v0}} is not in this plan", {
              v0: uiCopy(featureName),
            })}
            message={uiCopy(
              "Open Plan & features from More to review the capabilities available to this workspace.",
            )}
          />
        </Screen>
      );
    }

    return <Component {...props} />;
  }

  FeatureGatedScreen.displayName = `FeatureGate(${featureName})`;
  return FeatureGatedScreen;
}
