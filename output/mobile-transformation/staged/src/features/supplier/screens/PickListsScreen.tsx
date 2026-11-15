import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useOrders } from "../../../services/api/queries";
import {
  EmptyState,
  LoadingState,
  Screen,
  StatusPill,
} from "../../../components/ui";
import { formatMoney, formatShortDate } from "../../../utils/format";
import type { Order } from "../../../types/supplify";
import { colors, shadow, theme, type } from "../../../theme";

const PICK_STATUSES = new Set(["SHIPPED", "ACKNOWLEDGED", "PROCESSING"]);

export function PickListsScreen() {
  useUiLocale();

  const { data, isLoading } = useOrders({ limit: "100" });

  const orders = useMemo(() => {
    const all = data?.orders ?? [];
    return all.filter((o) => PICK_STATUSES.has(o.status));
  }, [data?.orders]);

  if (isLoading) return <LoadingState />;

  return (
    <Screen
      title={uiCopy("Pick lists")}
      subtitle={uiCopy("{{v0}} orders to fulfill", { v0: orders.length })}
      padded={false}
    >
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => (
          <View style={{ height: theme.spacing.sm }} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-outline"
            title={uiCopy("Nothing to pick")}
            message={uiCopy(
              "Orders in processing, acknowledged, or shipped status appear here.",
            )}
          />
        }
        renderItem={({ item, index }) => <PickRow order={item} index={index} />}
      />
    </Screen>
  );
}

function PickRow({ order, index }: { order: Order; index: number }) {
  useUiLocale();

  const itemCount = order.items?.length ?? 0;

  return (
    <View style={styles.row}>
      <View style={styles.bin}>
        <Text style={styles.binNum}>{index + 1}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.rowTop}>
          <Text style={styles.title} numberOfLines={1}>
            {order.restaurant_name ?? uiCopy("Order")}
          </Text>
          <StatusPill status={order.status} domain="fulfillment" />
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="cube-outline" size={14} color={colors.textMuted} />
            <Text style={styles.meta}>
              {itemCount} {uiCopy("line")} {itemCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
            <Text style={styles.meta}>
              {formatMoney(order.total_amount, order.currency)}
            </Text>
          </View>
          {formatShortDate(order.created_at) ? (
            <View style={styles.metaItem}>
              <Ionicons
                name="time-outline"
                size={14}
                color={colors.textFaint}
              />
              <Text style={styles.date}>
                {formatShortDate(order.created_at)}
              </Text>
            </View>
          ) : null}
        </View>
        {order.items && order.items.length > 0 ? (
          <View style={styles.itemsPreview}>
            {order.items.slice(0, 3).map((line) => (
              <Text
                key={line.id ?? `${line.product_id}-${line.quantity}`}
                style={styles.itemLine}
                numberOfLines={1}
              >
                · {line.quantity}× {line.product_name ?? line.product_id}
              </Text>
            ))}
            {order.items.length > 3 ? (
              <Text style={styles.moreItems}>
                +{order.items.length - 3} {uiCopy("more")}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xxl,
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
    backgroundColor: colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: theme.spacing.md,
    ...shadow.sm,
  },
  bin: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  binNum: { fontSize: 16, fontWeight: "800", color: colors.brand },
  body: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  title: { ...type.title, flex: 1 },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  date: { fontSize: 12, fontWeight: "500", color: colors.textFaint },
  itemsPreview: { marginTop: theme.spacing.sm, gap: 2 },
  itemLine: { fontSize: 13, fontWeight: "500", color: colors.textMuted },
  moreItems: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textFaint,
    marginTop: 2,
  },
});
