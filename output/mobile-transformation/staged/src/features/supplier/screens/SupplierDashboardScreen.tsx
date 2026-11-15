import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../features/auth/AuthContext";
import { BranchPickerSheet } from "../../shared/BranchPickerSheet";
import { useEntitlementMap } from "../../../hooks/useEntitlements";
import { moneyTotals } from "../../../lib/cartCurrency";
import {
  ASSISTANT_ACCESS_PERMISSIONS,
  usePermissions,
} from "../../../hooks/usePermissions";
import {
  useFulfillmentDispatch,
  useNotifications,
  useOrders,
  useSupplierDeliveryBoard,
} from "../../../services/api/queries";
import {
  EmptyState,
  ErrorState,
  Group,
  type IoniconName,
  ListRow,
  IconButton,
  ListSkeleton,
  Metric,
  SectionHeader,
} from "../../../components/ui";
import { V2OrderRow } from "../../../components/ui/v2";
import { HomeChrome, MetricStrip } from "../../../components/layout/HomeChrome";
import type { StatusTone } from "../../../theme/colors";
import { formatDay, formatMoney, formatOrderRef } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";
import { t } from "../../../i18n";

/** The supplier's order pipeline, in the order work actually moves through it. */
const PIPELINE: { key: string; label: string; statuses: string[] }[] = [
  { key: "new", label: "New", statuses: ["PLACED"] },
  { key: "confirmed", label: "Confirmed", statuses: ["ACKNOWLEDGED"] },
  { key: "preparing", label: "Preparing", statuses: ["PROCESSING"] },
  { key: "transit", label: "In transit", statuses: ["SHIPPED"] },
];

type AttentionItem = {
  key: string;
  title: string;
  subtitle: string;
  icon: IoniconName;
  tone: StatusTone;
  onPress: () => void;
};

export function SupplierDashboardScreen() {
  useUiLocale();

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { can, canAny } = usePermissions();
  const { isEnabled } = useEntitlementMap();
  const canDispatch = can("FULFILLMENT_VIEW") && isEnabled("fulfillment_tools");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const ordersQuery = useOrders({ limit: "50" }, can("ORDERS_VIEW"));
  const boardQuery = useSupplierDeliveryBoard("active_delivery", canDispatch);
  const dispatchQuery = useFulfillmentDispatch(canDispatch);
  const notificationsQuery = useNotifications();

  const refreshing =
    ordersQuery.isRefetching ||
    boardQuery.isRefetching ||
    dispatchQuery.isRefetching;
  const onRefresh = useCallback(() => {
    if (can("ORDERS_VIEW")) void ordersQuery.refetch();
    if (canDispatch) void boardQuery.refetch();
    if (canDispatch) void dispatchQuery.refetch();
    void notificationsQuery.refetch();
  }, [
    ordersQuery.refetch,
    boardQuery.refetch,
    dispatchQuery.refetch,
    notificationsQuery.refetch,
  ]);

  const allOrders = ordersQuery.data?.orders ?? [];
  const placed = allOrders.filter((o) => o.status === "PLACED");
  const processing = allOrders.filter((o) =>
    ["ACKNOWLEDGED", "PROCESSING"].includes(o.status),
  );
  const activeDeliveries = boardQuery.data?.orders ?? [];
  const dispatchOrders = dispatchQuery.data?.orders ?? [];
  const unassigned = dispatchOrders.filter(
    (o) => !(o.assignment?.driver_id ?? o.assignment?.driver_name),
  );
  const openOrders = allOrders.filter((o) =>
    ["PLACED", "ACKNOWLEDGED", "PROCESSING"].includes(o.status),
  );
  const openValue = moneyTotals(
    openOrders.map((order) => ({
      amount: Number(order.total_amount),
      currency: order.currency,
    })),
  )
    .map((entry) => formatMoney(entry.subtotal, entry.currency))
    .join(" + ");
  const workspaceTitle =
    user?.workspace?.tenantName ?? user?.displayName ?? "Supplier";
  const unread = (notificationsQuery.data ?? []).filter((n) => !n.read).length;

  const openOrdersTab = (status?: string) =>
    navigation.navigate("Tabs", {
      screen: "Orders",
      params: status ? { status } : undefined,
    });

  const attention: AttentionItem[] = [];
  if (placed.length > 0) {
    attention.push({
      key: "placed",
      title: uiCopy("{{v0}} new order{{v1}}", {
        v0: placed.length,
        v1: placed.length === 1 ? "" : "s",
      }),
      subtitle: uiCopy("Acknowledge and confirm"),
      icon: "file-tray-outline",
      tone: "warning",
      onPress: () => openOrdersTab("new"),
    });
  }
  if (unassigned.length > 0) {
    attention.push({
      key: "dispatch",
      title: uiCopy("{{v0}} {{v1}} without a driver", {
        v0: unassigned.length,
        v1: unassigned.length === 1 ? "delivery" : "deliveries",
      }),
      subtitle: uiCopy("Assign from the dispatch board"),
      icon: "car-outline",
      tone: "danger",
      onPress: () => navigation.navigate("Tabs", { screen: "Fulfillment" }),
    });
  }
  if (processing.length > 0) {
    attention.push({
      key: "process",
      title: uiCopy("{{v0}} in fulfillment", { v0: processing.length }),
      subtitle: uiCopy("Advance status or dispatch"),
      icon: "cube-outline",
      tone: "info",
      onPress: () => openOrdersTab("fulfillment"),
    });
  }
  if (unread > 0) {
    attention.push({
      key: "alerts",
      title: uiCopy("{{v0}} unread alert{{v1}}", {
        v0: unread,
        v1: unread === 1 ? "" : "s",
      }),
      subtitle: uiCopy("Notifications"),
      icon: "notifications-outline",
      tone: "brand",
      onPress: () => navigation.navigate("Notifications"),
    });
  }

  const nextOrder = placed[0] ?? processing[0] ?? allOrders[0];
  const pickCount = allOrders.filter((o) =>
    ["ACKNOWLEDGED", "PROCESSING", "SHIPPED"].includes(o.status),
  ).length;

  const chrome = (
    <HomeChrome
      title={workspaceTitle}
      subtitle={user?.workspace?.roleName ?? undefined}
      right={
        isEnabled("ai_assistant") && canAny(...ASSISTANT_ACCESS_PERMISSIONS) ? (
          <IconButton
            icon="sparkles-outline"
            label={uiCopy("Ask Supplify")}
            onPress={() => navigation.navigate("Assistant")}
            tone="brand"
          />
        ) : undefined
      }
      notificationCount={unread}
      onNotifications={() => navigation.navigate("Notifications")}
      onWorkspacePress={() => setWorkspaceOpen(true)}
      workspaceLabel="Switch account"
    />
  );

  if (
    ordersQuery.isLoading ||
    boardQuery.isLoading ||
    dispatchQuery.isLoading
  ) {
    return (
      <View style={styles.root}>
        {chrome}
        <ListSkeleton rows={6} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingBottom: insets.bottom + theme.spacing.lg,
        width: "100%",
        maxWidth: 1120,
        alignSelf: "center",
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.brand}
        />
      }
    >
      {chrome}

      <MetricStrip>
        <Metric
          value={ordersQuery.isError ? "—" : openOrders.length}
          label={uiCopy("Recent open orders")}
        />
        {canDispatch ? (
          <Metric
            value={boardQuery.isError ? "—" : activeDeliveries.length}
            label={uiCopy("Out for delivery")}
          />
        ) : null}
        {openValue ? (
          <Metric value={openValue} label={uiCopy("Recent open value")} />
        ) : null}
      </MetricStrip>

      <Text style={{ ...type.caption, paddingHorizontal: theme.gutter }}>
        {uiCopy("Order figures cover your 50 latest orders.")}
      </Text>

      {/* The supplier's signature view: where every live order currently sits. */}
      <SectionHeader>{uiCopy("Order pipeline")}</SectionHeader>
      <View style={styles.pipeline}>
        {PIPELINE.map((stage, index) => {
          const count = allOrders.filter((o) =>
            stage.statuses.includes(o.status),
          ).length;
          return (
            <Pressable
              key={stage.key}
              style={({ pressed }) => [
                styles.stage,
                index > 0 && styles.stageDivided,
                pressed && styles.stagePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${count} ${uiCopy(stage.label)}`}
              onPress={() => openOrdersTab(stage.key)}
            >
              <Text
                style={[
                  styles.stageCount,
                  count === 0 && styles.stageCountZero,
                ]}
              >
                {count}
              </Text>
              <Text style={styles.stageLabel} numberOfLines={2}>
                {stage.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {attention.length > 0 ? (
        <>
          <SectionHeader>{t("needsAttention")}</SectionHeader>
          <Group>
            {attention.map((item) => (
              <ListRow
                key={item.key}
                icon={item.icon}
                tone={item.tone}
                title={item.title}
                subtitle={item.subtitle}
                onPress={item.onPress}
              />
            ))}
          </Group>
        </>
      ) : null}

      {canDispatch ? (
        <>
          <SectionHeader>{t("happeningToday")}</SectionHeader>
          <Group>
            <ListRow
              icon="git-network-outline"
              title={uiCopy("Dispatch board")}
              subtitle={uiCopy("{{v0}} active · {{v1}} unassigned", {
                v0: activeDeliveries.length,
                v1: unassigned.length,
              })}
              onPress={() =>
                navigation.navigate("Tabs", { screen: "Fulfillment" })
              }
            />
            {can("FULFILLMENT_VIEW") ? (
              <ListRow
                icon="list-outline"
                title={uiCopy("Pick lists")}
                subtitle={uiCopy("{{v0}} order{{v1}} in the pick queue", {
                  v0: pickCount,
                  v1: pickCount === 1 ? "" : "s",
                })}
                onPress={() => navigation.navigate("PickLists")}
              />
            ) : null}
            <ListRow
              icon="document-text-outline"
              title={uiCopy("Run sheet")}
              subtitle={uiCopy("Operations summary for today")}
              onPress={() => navigation.navigate("RunSheet")}
            />
          </Group>
        </>
      ) : null}

      {nextOrder ? (
        <>
          <SectionHeader>{t("upNext")}</SectionHeader>
          <V2OrderRow
            title={nextOrder.restaurant_name ?? uiCopy("Order")}
            subtitle={formatDay(nextOrder.created_at)}
            note={formatOrderRef(nextOrder.id)}
            meta={formatMoney(nextOrder.total_amount, nextOrder.currency)}
            status={nextOrder.status}
            domain="order"
            onPress={() =>
              navigation.navigate("OrderDetail", { orderId: nextOrder.id })
            }
          />
        </>
      ) : null}

      <SectionHeader
        action={allOrders.length > 0 ? "See all" : undefined}
        onAction={allOrders.length > 0 ? () => openOrdersTab() : undefined}
      >
        {t("recent")}
      </SectionHeader>
      {ordersQuery.isError ? (
        <ErrorState
          message={uiCopy("Could not load orders.")}
          onRetry={() => void ordersQuery.refetch()}
        />
      ) : allOrders.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={uiCopy("No orders yet")}
          message={uiCopy("Orders placed by your customers will appear here.")}
        />
      ) : (
        allOrders
          .slice(0, 8)
          .map((order) => (
            <V2OrderRow
              key={order.id}
              title={order.restaurant_name ?? uiCopy("Order")}
              subtitle={formatDay(order.created_at)}
              note={formatOrderRef(order.id)}
              meta={formatMoney(order.total_amount, order.currency)}
              status={order.status}
              domain="order"
              onPress={() =>
                navigation.navigate("OrderDetail", { orderId: order.id })
              }
            />
          ))
      )}
      <BranchPickerSheet
        visible={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  pipeline: {
    flexDirection: "row",
    marginHorizontal: theme.gutter,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  stage: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xs,
  },
  stageDivided: {
    borderStartWidth: theme.hairline,
    borderStartColor: colors.separator,
  },
  stagePressed: { backgroundColor: colors.surfaceMuted },
  stageCount: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.3,
  },
  stageCountZero: { color: colors.textFaint },
  stageLabel: { ...type.caption, textAlign: "center" },
});
