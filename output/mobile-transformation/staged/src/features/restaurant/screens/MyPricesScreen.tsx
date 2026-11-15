import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useMyContractPricing } from "../../../services/api/queries";
import type { MyContractPrice } from "../../../types/contractPricing";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import {
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  SectionHeader,
  StatCard,
} from "../../../components/ui";
import { SearchField } from "../../../components/ui/SearchField";
import { formatMoney } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";

export function MyPricesScreen() {
  useUiLocale();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const query = useMyContractPricing(
    debouncedSearch ? { q: debouncedSearch } : undefined,
  );

  if (query.isLoading && !query.data) return <LoadingState />;

  const pricing = query.data?.pricing ?? [];
  const summary = query.data?.summary ?? [];
  const supplierCount =
    summary.length || new Set(pricing.map((row) => row.supplier_id)).size;

  return (
    <Screen
      title={uiCopy("My prices")}
      subtitle={uiCopy("Negotiated contract prices")}
      padded={false}
    >
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={uiCopy("Search supplier, product, or SKU")}
      />
      <View style={styles.statsWrap}>
        <View style={styles.statsRow}>
          <StatCard
            value={pricing.length}
            label={uiCopy("Contract lines")}
            icon="pricetag-outline"
            tone="brand"
          />
          <StatCard
            value={supplierCount}
            label={uiCopy("Suppliers")}
            icon="storefront-outline"
            tone="info"
          />
        </View>
      </View>
      <FlashList
        data={pricing}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ListHeaderComponent={
          <SectionHeader style={styles.section}>
            {uiCopy("Contract prices")}
          </SectionHeader>
        }
        ListEmptyComponent={
          <EmptyState
            title={uiCopy("No contract prices")}
            message={
              search
                ? uiCopy("Try a broader search.")
                : uiCopy(
                    "Suppliers can set negotiated prices that appear here and in catalog.",
                  )
            }
            icon="pricetag-outline"
          />
        }
        renderItem={({ item }) => <PriceRow item={item} />}
      />
    </Screen>
  );
}

function PriceRow({ item }: { item: MyContractPrice }) {
  useUiLocale();

  const currency = item.currency ?? "USD";
  const catalog =
    item.catalog_price != null &&
    item.price != null &&
    Number(item.catalog_price) > Number(item.price);

  return (
    <Card style={styles.card}>
      <Text style={type.title} numberOfLines={2}>
        {item.product_name ?? uiCopy("Product")}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {item.supplier_name ?? uiCopy("Supplier")}
        {item.product_sku
          ? uiCopy(" · SKU {{v0}}", { v0: item.product_sku })
          : ""}
      </Text>
      <View style={styles.priceRow}>
        <Text style={styles.price}>
          {item.price != null ? formatMoney(item.price, currency) : "—"}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{uiCopy("Your price")}</Text>
        </View>
      </View>
      {catalog ? (
        <Text style={styles.catalogStrike}>
          {formatMoney(item.catalog_price!, currency)} {uiCopy("catalog")}
        </Text>
      ) : null}
      {item.contract_discount_percentage != null &&
      item.contract_discount_percentage > 0 ? (
        <Text style={styles.discount}>
          {item.contract_discount_percentage} {uiCopy("% off catalog")}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  statsWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  statsRow: { flexDirection: "row", gap: theme.spacing.sm },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  section: { paddingTop: 0 },
  card: { marginBottom: theme.spacing.sm },
  meta: { ...type.caption, marginTop: 4 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  price: { ...type.label, color: colors.text },
  badge: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.success,
    letterSpacing: 0.3,
  },
  catalogStrike: {
    ...type.caption,
    textDecorationLine: "line-through",
    marginTop: 4,
  },
  discount: {
    ...type.caption,
    color: colors.success,
    marginTop: 2,
    fontWeight: "600",
  },
});
