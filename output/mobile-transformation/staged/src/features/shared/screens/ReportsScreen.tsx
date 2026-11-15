import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { useEntitlementMap } from "../../../hooks/useEntitlements";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  useRestaurantOrderVolumeReport,
  useRestaurantSpendBySupplierReport,
  useRestaurantTopProductsReport,
  useSupplierOrderVolumeReport,
  useSupplierRevenueTrendReport,
  useSupplierTopRestaurantsReport,
} from "../../../services/api/queries";
import type { ReportDateParams, ReportTabKey } from "../../../types/reports";
import {
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  SectionHeader,
  StatCard,
} from "../../../components/ui";
import { formatMoney } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";

const RESTAURANT_TABS: { key: ReportTabKey; label: string }[] = [
  { key: "order-volume", label: "Order volume" },
  { key: "spend-by-supplier", label: "Spend by supplier" },
  { key: "top-products", label: "Top products" },
];

const SUPPLIER_TABS: { key: ReportTabKey; label: string }[] = [
  { key: "revenue-trend", label: "Revenue trend" },
  { key: "top-restaurants", label: "Top restaurants" },
  { key: "order-volume", label: "Order volume" },
];

const RANGE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
] as const;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildRange(days: number): ReportDateParams {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: isoDate(from), to: isoDate(to), granularity: "day" };
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function ReportsScreen() {
  useUiLocale();

  const { user } = useAuth();
  const { canAny } = usePermissions();
  const { isEnabled } = useEntitlementMap();
  const isRestaurant = user?.role === "RESTAURANT";
  const tabs = isRestaurant ? RESTAURANT_TABS : SUPPLIER_TABS;

  const [rangeDays, setRangeDays] = useState(30);
  const [activeTab, setActiveTab] = useState<ReportTabKey>(
    tabs[0]?.key ?? "order-volume",
  );
  const range = useMemo(() => buildRange(rangeDays), [rangeDays]);

  const restaurantAllowed =
    isRestaurant &&
    isEnabled("reports") &&
    canAny("ORDERS_VIEW", "INVOICES_VIEW");
  const supplierAllowed =
    !isRestaurant &&
    isEnabled("reports") &&
    canAny("FULFILLMENT_VIEW", "INVOICES_VIEW", "CATALOG_EDIT");

  const orderVolumeQuery = useRestaurantOrderVolumeReport(
    range,
    restaurantAllowed && activeTab === "order-volume",
  );
  const spendQuery = useRestaurantSpendBySupplierReport(
    range,
    restaurantAllowed && activeTab === "spend-by-supplier",
  );
  const topProductsQuery = useRestaurantTopProductsReport(
    range,
    restaurantAllowed && activeTab === "top-products",
  );
  const revenueQuery = useSupplierRevenueTrendReport(
    range,
    supplierAllowed && activeTab === "revenue-trend",
  );
  const topRestaurantsQuery = useSupplierTopRestaurantsReport(
    range,
    supplierAllowed && activeTab === "top-restaurants",
  );
  const supplierVolumeQuery = useSupplierOrderVolumeReport(
    range,
    supplierAllowed && activeTab === "order-volume" && !isRestaurant,
  );

  const activeQuery =
    activeTab === "order-volume" && isRestaurant
      ? orderVolumeQuery
      : activeTab === "spend-by-supplier"
        ? spendQuery
        : activeTab === "top-products"
          ? topProductsQuery
          : activeTab === "revenue-trend"
            ? revenueQuery
            : activeTab === "top-restaurants"
              ? topRestaurantsQuery
              : supplierVolumeQuery;

  const rows = activeQuery.data ?? [];
  const loading = activeQuery.isLoading && !activeQuery.data;
  const stats = useMemo(() => computeStats(activeTab, rows), [activeTab, rows]);

  if (!restaurantAllowed && !supplierAllowed) {
    return (
      <Screen title={uiCopy("Reports")}>
        <EmptyState
          icon="lock-closed-outline"
          title={uiCopy("Reports unavailable")}
          message={uiCopy(
            "Your role or plan does not include analytics for this workspace.",
          )}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={isRestaurant ? uiCopy("Purchasing reports") : uiCopy("Analytics")}
      subtitle={`${range.from} → ${range.to}`}
      padded={false}
    >
      <View style={styles.filters}>
        <SectionHeader style={styles.filterHeader}>
          {uiCopy("Date range")}
        </SectionHeader>
        <View style={styles.chips}>
          {RANGE_PRESETS.map((preset) => {
            const active = preset.days === rangeDays;
            return (
              <Pressable
                key={preset.label}
                onPress={() => setRangeDays(preset.days)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionHeader style={styles.filterHeader}>
          {uiCopy("Report")}
        </SectionHeader>
        <View style={styles.chips}>
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.statsWrap}>
        <View style={styles.statsRow}>
          <StatCard
            value={stats.primary}
            label={stats.primaryLabel}
            icon={stats.icon}
            tone="brand"
          />
          <StatCard
            value={stats.secondary}
            label={stats.secondaryLabel}
            icon="analytics-outline"
            tone="info"
          />
        </View>
      </View>

      {loading ? (
        <LoadingState />
      ) : (
        <FlashList
          data={rows as Record<string, unknown>[]}
          keyExtractor={(item, index) =>
            String(
              item.id ??
                item.period ??
                item.supplier_id ??
                item.product_id ??
                item.restaurant_id ??
                index,
            )
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isRefetching}
              onRefresh={() => void activeQuery.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={uiCopy("No data")}
              message={uiCopy(
                "Nothing matched this date range. Try a wider window.",
              )}
              icon="analytics-outline"
            />
          }
          renderItem={({ item }) => (
            <ReportRow tab={activeTab} item={item} max={stats.maxValue} />
          )}
        />
      )}
    </Screen>
  );
}

function computeStats(tab: ReportTabKey, rows: unknown[]) {
  const list = rows as Record<string, unknown>[];
  if (tab === "order-volume") {
    const orders = list.reduce(
      (sum, row) => sum + toNumber(row.order_count as number),
      0,
    );
    const amount = list.reduce(
      (sum, row) => sum + toNumber(row.total_amount as number | string),
      0,
    );
    return {
      primary: orders,
      primaryLabel: "Orders",
      secondary: formatMoney(amount),
      secondaryLabel: "Order value",
      icon: "receipt-outline" as const,
      maxValue: Math.max(
        ...list.map((row) => toNumber(row.order_count as number)),
        1,
      ),
    };
  }
  if (tab === "spend-by-supplier") {
    const spend = list.reduce(
      (sum, row) => sum + toNumber(row.total_spend as number | string),
      0,
    );
    return {
      primary: formatMoney(spend),
      primaryLabel: "Total spend",
      secondary: list.length,
      secondaryLabel: "Suppliers",
      icon: "storefront-outline" as const,
      maxValue: Math.max(
        ...list.map((row) => toNumber(row.total_spend as number | string)),
        1,
      ),
    };
  }
  if (tab === "top-products") {
    const spend = list.reduce(
      (sum, row) => sum + toNumber(row.total_spend as number | string),
      0,
    );
    return {
      primary: list.length,
      primaryLabel: "Products",
      secondary: formatMoney(spend),
      secondaryLabel: "Total spend",
      icon: "cube-outline" as const,
      maxValue: Math.max(
        ...list.map((row) => toNumber(row.total_spend as number | string)),
        1,
      ),
    };
  }
  if (tab === "revenue-trend") {
    const revenue = list.reduce(
      (sum, row) => sum + toNumber(row.revenue as number | string),
      0,
    );
    const orders = list.reduce(
      (sum, row) => sum + toNumber(row.order_count as number),
      0,
    );
    return {
      primary: formatMoney(revenue),
      primaryLabel: "Revenue",
      secondary: orders,
      secondaryLabel: "Orders",
      icon: "trending-up-outline" as const,
      maxValue: Math.max(
        ...list.map((row) => toNumber(row.revenue as number | string)),
        1,
      ),
    };
  }
  if (tab === "top-restaurants") {
    const revenue = list.reduce(
      (sum, row) => sum + toNumber(row.revenue as number | string),
      0,
    );
    return {
      primary: formatMoney(revenue),
      primaryLabel: "Revenue",
      secondary: list.length,
      secondaryLabel: "Restaurants",
      icon: "restaurant-outline" as const,
      maxValue: Math.max(
        ...list.map((row) => toNumber(row.revenue as number | string)),
        1,
      ),
    };
  }
  const orders = list.reduce(
    (sum, row) => sum + toNumber(row.order_count as number),
    0,
  );
  return {
    primary: orders,
    primaryLabel: "Orders",
    secondary: list.length,
    secondaryLabel: "Periods",
    icon: "receipt-outline" as const,
    maxValue: Math.max(
      ...list.map((row) => toNumber(row.order_count as number)),
      1,
    ),
  };
}

function ReportRow({
  tab,
  item,
  max,
}: {
  tab: ReportTabKey;
  item: Record<string, unknown>;
  max: number;
}) {
  useUiLocale();

  if (tab === "order-volume") {
    const count = toNumber(item.order_count as number);
    const amount = toNumber(item.total_amount as number | string);
    return (
      <BarCard
        title={String(item.period ?? "—")}
        value={`${count} orders · ${formatMoney(amount)}`}
        fill={count}
        max={max}
      />
    );
  }
  if (tab === "spend-by-supplier") {
    const spend = toNumber(item.total_spend as number | string);
    return (
      <BarCard
        title={String(item.supplier_name ?? uiCopy("Supplier"))}
        value={`${formatMoney(spend)} · ${item.order_count ?? 0} orders`}
        fill={spend}
        max={max}
      />
    );
  }
  if (tab === "top-products") {
    const spend = toNumber(item.total_spend as number | string);
    const qty = toNumber((item.total_qty ?? item.quantity) as number | string);
    return (
      <BarCard
        title={String(item.product_name ?? uiCopy("Product"))}
        value={`${formatMoney(spend)} · Qty ${qty}`}
        fill={spend}
        max={max}
        subtitle={
          item.sku ? uiCopy("SKU {{v0}}", { v0: String(item.sku) }) : undefined
        }
      />
    );
  }
  if (tab === "revenue-trend") {
    const revenue = toNumber(item.revenue as number | string);
    return (
      <BarCard
        title={String(item.period ?? "—")}
        value={`${formatMoney(revenue)} · ${item.order_count ?? 0} orders`}
        fill={revenue}
        max={max}
      />
    );
  }
  if (tab === "top-restaurants") {
    const revenue = toNumber(item.revenue as number | string);
    return (
      <BarCard
        title={String(item.restaurant_name ?? uiCopy("Restaurant"))}
        value={`${formatMoney(revenue)} · ${item.order_count ?? 0} orders`}
        fill={revenue}
        max={max}
      />
    );
  }
  const count = toNumber(item.order_count as number);
  return (
    <BarCard
      title={String(item.period ?? "—")}
      value={`${count} orders`}
      fill={count}
      max={max}
    />
  );
}

function BarCard({
  title,
  value,
  fill,
  max,
  subtitle,
}: {
  title: string;
  value: string;
  fill: number;
  max: number;
  subtitle?: string;
}) {
  useUiLocale();

  const pct = max > 0 ? Math.min(100, (fill / max) * 100) : 0;
  return (
    <Card style={styles.card}>
      <Text style={type.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.meta}>{subtitle}</Text> : null}
      <Text style={styles.value}>{value}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  filterHeader: { paddingTop: 0, marginBottom: theme.spacing.xs },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  chipText: { ...type.caption, color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: colors.brandDark },
  statsWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  statsRow: { flexDirection: "row", gap: theme.spacing.sm },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  card: { marginBottom: theme.spacing.sm },
  meta: { ...type.caption, marginTop: 2 },
  value: { ...type.label, marginTop: 6, color: colors.text },
  barTrack: {
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: colors.backgroundAlt,
    marginTop: 10,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: colors.brand,
    borderRadius: theme.radius.pill,
  },
});
