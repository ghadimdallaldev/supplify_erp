import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { OrderDetailContent } from "./OrderDetailScreen";
import { SplitView } from "../../../components/layout/SplitView";
import { useAdaptiveLayout } from "../../../theme/responsive";
import { useMemo, useState } from "react";
import { RefreshControl, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RestaurantStackParamList } from "../../../navigation/RestaurantNavigator";
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

const OPEN_STATUSES = ["PLACED", "ACKNOWLEDGED", "PROCESSING", "SHIPPED"];
const DONE_STATUSES = [
  "DELIVERED",
  "RECEIVED",
  "RECEIVED_PARTIAL",
  "RECEIVED_FULL",
  "RECEIVED_WITH_DISPUTE",
  "INVOICED",
  "COMPLETED",
];

type FilterKey = "all" | "open" | "delivered" | "cancelled";

export function OrdersScreen() {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { wide } = useAdaptiveLayout();
  const [filter, setFilter] = useState<FilterKey>("all");
  const query = useOrders({ limit: "50" });
  const allOrders = query.data?.orders ?? [];

  const counts = useMemo(
    () => ({
      all: allOrders.length,
      open: allOrders.filter((o) => OPEN_STATUSES.includes(o.status)).length,
      delivered: allOrders.filter((o) => DONE_STATUSES.includes(o.status))
        .length,
      cancelled: allOrders.filter((o) => o.status === "CANCELLED").length,
    }),
    [allOrders],
  );

  const orders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allOrders.filter((order) => {
      const matchesSearch =
        !term ||
        order.supplier_name?.toLowerCase().includes(term) ||
        orderShortId(order.id).toLowerCase().includes(term);
      const matchesFilter =
        filter === "all" ||
        (filter === "open"
          ? OPEN_STATUSES.includes(order.status)
          : filter === "delivered"
            ? DONE_STATUSES.includes(order.status)
            : order.status === "CANCELLED");
      return matchesSearch && matchesFilter;
    });
  }, [allOrders, search, filter]);

  const master = (
    <Screen
      title={uiCopy("Orders")}
      subtitle={uiCopy("{{v0}} shown", { v0: orders.length })}
      padded={false}
    >
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={uiCopy("Supplier or order number")}
      />
      <FilterBar
        options={[
          { key: "all", label: uiCopy("All"), count: counts.all },
          { key: "open", label: uiCopy("Open"), count: counts.open },
          {
            key: "delivered",
            label: uiCopy("Delivered"),
            count: counts.delivered,
          },
          {
            key: "cancelled",
            label: uiCopy("Cancelled"),
            count: counts.cancelled,
          },
        ]}
        value={filter}
        onChange={(k) => setFilter(k as FilterKey)}
      />
      {query.isLoading && !query.data ? (
        <ListSkeleton rows={8} />
      ) : query.isError ? (
        <ErrorState
          message={uiCopy(
            "Could not load your orders. Check your connection and try again.",
          )}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlashList
          data={orders}
          contentContainerStyle={styles.list}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={uiCopy("No matching orders")}
              message={
                search || filter !== "all"
                  ? uiCopy("Try a different search or filter.")
                  : uiCopy("Place an order from a supplier catalog.")
              }
              icon="receipt-outline"
            />
          }
          renderItem={({ item }) => (
            <V2OrderRow
              title={item.supplier_name ?? uiCopy("Order")}
              subtitle={formatDay(item.created_at)}
              note={
                item.items?.length
                  ? uiCopy("{{v0}} · {{v1}} line{{v2}}", {
                      v0: formatOrderRef(item.id),
                      v1: item.items.length,
                      v2: item.items.length === 1 ? "" : "s",
                    })
                  : formatOrderRef(item.id)
              }
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
          <OrderDetailContent key={selectedId} orderId={selectedId} />
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
