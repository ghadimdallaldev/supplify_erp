import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { SupplierOrderDetailContent } from "./SupplierOrderDetailScreen";
import { SplitView } from "../../../components/layout/SplitView";
import { useAdaptiveLayout } from "../../../theme/responsive";
import { useEffect, useMemo, useState } from "react";
import { RefreshControl, StyleSheet } from "react-native";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  SupplierStackParamList,
  SupplierTabParamList,
} from "../../../navigation/SupplierNavigator";
import { useOrders } from "../../../services/api/queries";
import {
  EmptyState,
  ErrorState,
  FilterBar,
  FlashList,
  ListSkeleton,
  Screen,
} from "../../../components/ui";
import { SearchField } from "../../../components/ui/SearchField";
import { V2OrderRow } from "../../../components/ui/v2";
import {
  formatDay,
  formatMoney,
  formatOrderRef,
  orderShortId,
} from "../../../utils/format";
import { theme } from "../../../theme";

type StageKey =
  | "all"
  | "new"
  | "confirmed"
  | "preparing"
  | "transit"
  | "delivered"
  | "fulfillment";

/** Mirrors the pipeline stages on the supplier home so the two read as one system. */
const STAGES: { key: StageKey; label: string; statuses: string[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "new", label: "New", statuses: ["PLACED"] },
  { key: "confirmed", label: "Confirmed", statuses: ["ACKNOWLEDGED"] },
  { key: "preparing", label: "Preparing", statuses: ["PROCESSING"] },
  { key: "transit", label: "In transit", statuses: ["SHIPPED"] },
  {
    key: "delivered",
    label: "Delivered",
    statuses: [
      "DELIVERED",
      "RECEIVED",
      "RECEIVED_PARTIAL",
      "RECEIVED_FULL",
      "RECEIVED_WITH_DISPUTE",
      "INVOICED",
      "COMPLETED",
    ],
  },
  {
    key: "fulfillment",
    label: "In fulfillment",
    statuses: ["ACKNOWLEDGED", "PROCESSING"],
  },
];
/** "In fulfillment" is only reachable from the home attention list, not the chip bar. */
const VISIBLE_STAGES: StageKey[] = [
  "all",
  "new",
  "confirmed",
  "preparing",
  "transit",
  "delivered",
];

export function SupplierOrdersScreen() {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<SupplierStackParamList>>();
  const route = useRoute<RouteProp<SupplierTabParamList, "Orders">>();
  const requestedStage = route.params?.status;
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { wide } = useAdaptiveLayout();
  const [stage, setStage] = useState<StageKey>("all");
  const query = useOrders({ limit: "50" });
  const allOrders = query.data?.orders ?? [];

  // Home pipeline taps deep-link into a stage; keep it in sync without trapping the user.
  useEffect(() => {
    if (requestedStage && STAGES.some((s) => s.key === requestedStage)) {
      setStage(requestedStage as StageKey);
    }
  }, [requestedStage]);

  const counts = useMemo(() => {
    const map = {} as Record<StageKey, number>;
    for (const s of STAGES) {
      const statuses = s.statuses;
      map[s.key] = statuses
        ? allOrders.filter((o) => statuses.includes(o.status)).length
        : allOrders.length;
    }
    return map;
  }, [allOrders]);

  const orders = useMemo(() => {
    const term = search.trim().toLowerCase();
    const active = STAGES.find((s) => s.key === stage);
    return allOrders.filter((order) => {
      const matchesTerm =
        !term ||
        (order.customer_display_name || order.restaurant_name)
          ?.toLowerCase()
          .includes(term) ||
        orderShortId(order.id).toLowerCase().includes(term) ||
        (order.status ?? "").toLowerCase().includes(term);
      const matchesStage =
        !active?.statuses || active.statuses.includes(order.status);
      return matchesTerm && matchesStage;
    });
  }, [allOrders, search, stage]);

  const master = (
    <Screen
      title={uiCopy("Orders")}
      subtitle={uiCopy("{{v0}} shown", { v0: orders.length })}
      padded={false}
    >
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={uiCopy("Restaurant, status, or order number")}
      />
      <FilterBar
        options={VISIBLE_STAGES.map((key) => {
          const s = STAGES.find((x) => x.key === key)!;
          return { key, label: s.label, count: counts[key] };
        })}
        value={stage}
        onChange={(k) => setStage(k as StageKey)}
      />
      {query.isLoading && !query.data ? (
        <ListSkeleton rows={8} />
      ) : query.isError ? (
        <ErrorState
          message={uiCopy(
            "Could not load orders. Check your connection and try again.",
          )}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlashList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={uiCopy("No matching orders")}
              message={
                search || stage !== "all"
                  ? uiCopy("Try a different search or stage.")
                  : uiCopy("New orders will show up here.")
              }
            />
          }
          renderItem={({ item }) => (
            <V2OrderRow
              title={
                item.customer_display_name ??
                item.restaurant_name ??
                uiCopy("Customer")
              }
              subtitle={`${item.customer_type && item.customer_type !== "RESTAURANT" ? `${item.customer_type} · ` : ""}${formatDay(item.created_at)}`}
              note={`${formatOrderRef(item.id)}${item.requested_delivery_method ? ` · ${item.requested_delivery_method}` : ""}`}
              meta={formatMoney(item.total_amount, item.currency)}
              status={item.status}
              domain="order"
              onPress={() =>
                wide
                  ? setSelectedId(item.id)
                  : navigation.navigate("OrderDetail", { orderId: item.id })
              }
            />
          )}
        />
      )}
    </Screen>
  );
  return (
    <SplitView
      master={master}
      detail={
        selectedId ? (
          <SupplierOrderDetailContent key={selectedId} orderId={selectedId} />
        ) : (
          <EmptyState
            icon="receipt-outline"
            title={uiCopy("Orders")}
            message={uiCopy("Choose an order to inspect its details.")}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
});
