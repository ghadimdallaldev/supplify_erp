import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { usePromotionAnalytics } from "../../../services/api/queries";
import { Card, LoadingState, Screen, StatCard } from "../../../components/ui";
import { formatMoney } from "../../../utils/format";
import { colors, theme } from "../../../theme";
import type { SupplierStackParamList } from "../../../navigation/SupplierNavigator";

type Props = NativeStackScreenProps<SupplierStackParamList, "DealAnalytics">;

export function DealAnalyticsScreen({ route }: Props) {
  useUiLocale();

  const { dealId, name } = route.params;
  const { data, isLoading, isError } = usePromotionAnalytics(dealId);

  if (isLoading) return <LoadingState />;

  return (
    <Screen
      title={uiCopy("Deal analytics")}
      subtitle={name || uiCopy("Performance & ROAS")}
    >
      {isError || !data ? (
        <Card>
          <Text style={styles.error}>
            {uiCopy("Could not load analytics.")}
          </Text>
        </Card>
      ) : (
        <View style={styles.grid}>
          <View style={styles.row}>
            <StatCard
              value={data.views ?? 0}
              label={uiCopy("Views")}
              icon="eye-outline"
              tone="info"
            />
            <StatCard
              value={data.clicks ?? 0}
              label={uiCopy("Clicks")}
              icon="hand-left-outline"
              tone="info"
            />
          </View>
          <View style={styles.row}>
            <StatCard
              value={data.orders_influenced ?? data.orders ?? 0}
              label={uiCopy("Orders")}
              icon="receipt-outline"
              tone="success"
            />
            <StatCard
              value={
                data.conversionRate != null ? `${data.conversionRate}%` : "—"
              }
              label={uiCopy("Conversion")}
              icon="pulse-outline"
              tone="warning"
            />
          </View>
          <View style={styles.row}>
            <StatCard
              value={formatMoney(Number(data.adSpend || 0))}
              label={uiCopy("Ad spend")}
              icon="cash-outline"
              tone="warning"
            />
            <StatCard
              value={formatMoney(Number(data.attributedGmv || 0))}
              label={uiCopy("Attributed GMV")}
              icon="trending-up-outline"
              tone="success"
            />
          </View>
          <View style={styles.row}>
            <StatCard
              value={
                data.roas != null ? `${Number(data.roas).toFixed(2)}x` : "—"
              }
              label="ROAS"
              icon="analytics-outline"
              tone="info"
            />
            <StatCard
              value={
                data.costPerOrder != null
                  ? formatMoney(Number(data.costPerOrder))
                  : "—"
              }
              label={uiCopy("Cost / order")}
              icon="pricetag-outline"
              tone="warning"
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { gap: theme.spacing.sm },
  row: { flexDirection: "row", gap: theme.spacing.sm },
  error: { color: colors.danger, fontWeight: "600" },
});
