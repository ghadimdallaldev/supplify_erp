import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSupplierPriceComparisons } from "../../../services/api/queries";
import { SectionHeader } from "../../../components/ui";
import { formatMoney } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";

/**
 * Compact horizontal strip of the cheapest matched offers from followed suppliers.
 * Horizontal so it costs a fixed ~120px regardless of how many matches come back,
 * instead of pushing supplier discovery below the fold.
 */
export function BestPricesPanel({
  onOpenSupplier,
}: {
  onOpenSupplier?: (supplierId: string, supplierName: string) => void;
}) {
  useUiLocale();

  const query = useSupplierPriceComparisons();
  const comparisons = (query.data?.comparisons ?? []).slice(0, 8);
  if (query.isLoading || comparisons.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <SectionHeader>
        {uiCopy("Best prices · suppliers you follow")}
      </SectionHeader>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {comparisons.map((comparison) => {
          const { bestOffer } = comparison;
          const unit = comparison.unit || "";
          return (
            <Pressable
              key={`${comparison.productName}-${unit}-${comparison.currency}`}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              accessibilityRole={onOpenSupplier ? "button" : undefined}
              disabled={!onOpenSupplier}
              onPress={() =>
                onOpenSupplier?.(bestOffer.supplierId, bestOffer.supplierName)
              }
            >
              <Text style={type.title} numberOfLines={1}>
                {comparison.productName}
              </Text>
              <Text style={styles.supplier} numberOfLines={1}>
                {bestOffer.supplierName}
              </Text>
              <View style={styles.priceRow}>
                <Text style={styles.price} numberOfLines={1}>
                  {formatMoney(Number(bestOffer.amount), comparison.currency)}
                </Text>
                {comparison.savingsPercent > 0 ? (
                  <Text style={styles.savings}>
                    −{comparison.savingsPercent}%
                  </Text>
                ) : null}
              </View>
              <Text style={type.caption} numberOfLines={1}>
                {unit ? uiCopy("per {{v0}} · ", { v0: unit }) : ""}
                {comparison.supplierCount} {uiCopy("supplier")}{" "}
                {comparison.supplierCount === 1 ? "" : "s"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: theme.spacing.md },
  row: { paddingHorizontal: theme.gutter, gap: theme.spacing.sm },
  card: {
    width: 176,
    gap: 2,
    padding: theme.spacing.md,
    backgroundColor: colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  supplier: { ...type.label, marginBottom: theme.spacing.xs },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.sm,
  },
  price: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2,
  },
  savings: { ...type.caption, color: colors.success, fontWeight: "700" },
});
