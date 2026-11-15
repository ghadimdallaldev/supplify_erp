import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  useConsumerOrders,
  useUpdateConsumerOrderStatus,
} from "../../../services/api/queries";
import type {
  ConsumerOrderStatus,
  ConsumerOrderSummary,
} from "../../../types/consumer";
import { usePermissions } from "../../../hooks/usePermissions";
import { useToast } from "../../shared/ToastProvider";
import {
  Button,
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  SectionHeader,
  StatusPill,
} from "../../../components/ui";
import { ApiError } from "../../../services/api/client";
import {
  consumerFulfillmentLabel,
  consumerOrderStatusLabel,
  getNextConsumerOrderStatus,
  nextConsumerOrderActionLabel,
} from "../../../utils/consumerOrder";
import { formatMoney, formatShortDate } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";

const STATUS_FILTERS: Array<{
  key: "ALL" | ConsumerOrderStatus;
  label: string;
}> = [
  { key: "ALL", label: "All" },
  { key: "RECEIVED", label: "Received" },
  { key: "PREPARING", label: "Preparing" },
  { key: "SHIPPED", label: "In progress" },
  { key: "DELIVERED", label: "Done" },
];

export function ConsumerOrdersScreen() {
  useUiLocale();

  const { can } = usePermissions();
  const canManage = can("ORDERS_MANAGE");
  const showToast = useToast();
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]["key"]>("ALL");

  const query = useConsumerOrders(
    statusFilter === "ALL" ? undefined : { status: statusFilter },
  );
  const updateStatus = useUpdateConsumerOrderStatus();

  const orders = query.data?.orders ?? [];
  const activeCount = useMemo(
    () =>
      orders.filter(
        (order) => !["DELIVERED", "CANCELLED"].includes(order.status),
      ).length,
    [orders],
  );

  const advance = async (order: ConsumerOrderSummary) => {
    const next = getNextConsumerOrderStatus(order.status);
    if (!next) return;
    try {
      await updateStatus.mutateAsync({ id: order.id, status: next });
      showToast(
        `Order marked ${consumerOrderStatusLabel(next).toLowerCase()}.`,
        "success",
      );
    } catch (error) {
      showToast(apiMessage(error), "error");
    }
  };

  if (query.isLoading && !query.data) return <LoadingState />;

  return (
    <Screen
      title={uiCopy("Guest orders")}
      subtitle={uiCopy("Kitchen board for guest checkout")}
      padded={false}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              onPress={() => setStatusFilter(filter.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {orders.length} {uiCopy("order")} {orders.length === 1 ? "" : "s"}
          {statusFilter === "ALL"
            ? uiCopy(" · {{v0}} active", { v0: activeCount })
            : ""}
        </Text>
      </View>

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
        ListHeaderComponent={
          <SectionHeader style={styles.section}>
            {uiCopy("Orders")}
          </SectionHeader>
        }
        ListEmptyComponent={
          <EmptyState
            title={uiCopy("No guest orders")}
            message={
              statusFilter === "ALL"
                ? uiCopy("Guest orders from your public menu will appear here.")
                : uiCopy("No orders match this filter.")
            }
            icon="fast-food-outline"
          />
        }
        renderItem={({ item }) => (
          <OrderRow
            order={item}
            canManage={canManage}
            updating={updateStatus.isPending}
            onAdvance={() => void advance(item)}
          />
        )}
      />
    </Screen>
  );
}

function OrderRow({
  order,
  canManage,
  updating,
  onAdvance,
}: {
  order: ConsumerOrderSummary;
  canManage: boolean;
  updating: boolean;
  onAdvance: () => void;
}) {
  useUiLocale();

  const next = getNextConsumerOrderStatus(order.status);
  const lines = order.lines ?? [];

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={type.title}>{order.order_number}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {order.guest_name} ·{" "}
            {consumerFulfillmentLabel(order.fulfillment_type)}
          </Text>
          <Text style={styles.meta}>{formatShortDate(order.created_at)}</Text>
        </View>
        <StatusPill
          status={consumerOrderStatusLabel(order.status)}
          tone={
            order.status === "CANCELLED"
              ? "danger"
              : order.status === "DELIVERED"
                ? "success"
                : "warning"
          }
        />
      </View>

      {lines.length ? (
        <View style={styles.lines}>
          {lines.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <Text style={styles.lineText} numberOfLines={2}>
                {line.quantity}× {line.item_name}
              </Text>
              <Text style={styles.linePrice}>
                {formatMoney(line.line_total)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.total}>{formatMoney(order.total_amount)}</Text>
        {canManage && next ? (
          <Button
            label={nextConsumerOrderActionLabel(
              order.status,
              order.fulfillment_type,
            )}
            variant="outline"
            loading={updating}
            onPress={onAdvance}
          />
        ) : null}
      </View>
    </Card>
  );
}

function apiMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandLight,
  },
  filterChipText: { fontWeight: "700", color: colors.textMuted, fontSize: 13 },
  filterChipTextActive: { color: colors.brand },
  summary: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  summaryText: { ...type.caption, fontWeight: "600" },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  section: { paddingTop: 0 },
  card: { marginBottom: theme.spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  flex: { flex: 1 },
  meta: { ...type.caption, marginTop: 2 },
  lines: {
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: theme.spacing.sm,
    gap: 6,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  lineText: { ...type.caption, flex: 1 },
  linePrice: { ...type.caption, fontWeight: "700" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  total: { ...type.label, color: colors.text },
});
