import { Text } from "../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { StyleSheet, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import {
  Button,
  Card,
  ListRow,
  LoadingState,
  Screen,
  SectionHeader,
  StatusPill,
} from "../../components/ui";
import { useEntitlementMap } from "../../hooks/useEntitlements";
import { colors, theme } from "../../theme";

const RESTAURANT_FEATURES = [
  ["chat", "Chat"],
  ["quick_lists", "Quick lists"],
  ["receiving_quality", "Receiving and quality"],
  ["finance_invoices", "Finance and invoices"],
  ["inventory_management", "Inventory management"],
  ["disputes_returns", "Disputes and returns"],
  ["supplier_deals", "Supplier deals"],
  ["push_notifications", "Push notifications"],
] as const;

const SUPPLIER_FEATURES = [
  ["chat", "Chat"],
  ["fulfillment_tools", "Fulfillment and logistics"],
  ["finance_invoices", "Finance and invoices"],
  ["disputes_returns", "Disputes and returns"],
  ["promotions", "Promotions"],
  ["push_notifications", "Push notifications"],
] as const;

export function SubscriptionScreen() {
  useUiLocale();

  const { user } = useAuth();
  const { plan, isLoading, error, refetch, isEnabled } = useEntitlementMap();

  if (isLoading) return <LoadingState message={uiCopy("Loading plan…")} />;

  const features =
    user?.role === "SUPPLIER" ? SUPPLIER_FEATURES : RESTAURANT_FEATURES;

  return (
    <Screen title={uiCopy("Plan & features")} scroll>
      <Card>
        <Text style={styles.eyebrow}>{uiCopy("CURRENT PLAN")}</Text>
        <Text style={styles.plan}>
          {plan?.name ?? uiCopy("Plan unavailable")}
        </Text>
        {plan?.code ? (
          <Text style={styles.code}>{plan.code.toUpperCase()}</Text>
        ) : null}
        <Text style={styles.note}>
          {uiCopy(
            "Billing and plan changes are managed in the Supplify web dashboard.",
          )}
        </Text>
      </Card>

      {error ? (
        <Card>
          <Text style={styles.error}>
            {uiCopy("Plan capabilities could not be refreshed.")}
          </Text>
          <Button
            label={uiCopy("Try again")}
            variant="outline"
            icon="refresh-outline"
            onPress={() => void refetch()}
          />
        </Card>
      ) : null}

      {!error ? (
        <>
          <SectionHeader>{uiCopy("Mobile capabilities")}</SectionHeader>
          <View style={styles.list}>
            {features.map(([key, label]) => {
              const enabled = isEnabled(key);
              return (
                <ListRow
                  key={key}
                  icon={
                    enabled ? "checkmark-circle-outline" : "lock-closed-outline"
                  }
                  iconTone={enabled ? "success" : "neutral"}
                  title={label}
                  subtitle={
                    enabled
                      ? uiCopy("Available in this workspace")
                      : uiCopy("Not included in the current plan")
                  }
                  right={
                    <StatusPill
                      status={enabled ? "Available" : "Not included"}
                      tone={enabled ? "success" : "neutral"}
                    />
                  }
                />
              );
            })}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  plan: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: theme.spacing.xs,
  },
  code: { color: colors.brand, fontSize: 12, fontWeight: "800", marginTop: 2 },
  note: {
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: theme.spacing.md,
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
    marginBottom: theme.spacing.md,
  },
  list: { gap: theme.spacing.sm },
});
