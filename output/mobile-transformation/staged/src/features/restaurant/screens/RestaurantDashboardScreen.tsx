import { NextAction } from "../../../components/ui/NextAction";
import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useCallback, useMemo, useState } from "react";
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
import {
  ASSISTANT_ACCESS_PERMISSIONS,
  usePermissions,
} from "../../../hooks/usePermissions";
import {
  useOrders,
  useNotifications,
  usePendingReceiving,
  useSuppliers,
} from "../../../services/api/queries";
import { useCartStore } from "../../../store/cartStore";
import {
  EmptyState,
  ErrorState,
  type IoniconName,
  ListRow,
  IconButton,
  ListSkeleton,
  Metric,
  SectionHeader,
} from "../../../components/ui";
import {
  V2OrderRow,
  V2QuickActionTile,
  V2SectionHeader,
} from "../../../components/ui/v2";
import { HomeChrome, MetricStrip } from "../../../components/layout/HomeChrome";
import type { StatusTone } from "../../../theme/colors";
import { formatDay, formatMoney, formatOrderRef } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";
import { t } from "../../../i18n";
import { moneyTotals } from "../../../lib/cartCurrency";

type AttentionItem = {
  key: string;
  title: string;
  subtitle: string;
  icon: IoniconName;
  tone: StatusTone;
  onPress: () => void;
};

export function RestaurantDashboardScreen() {
  const uiLocale = useUiLocale();

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { can, canAny } = usePermissions();
  const { isEnabled, isLoading: entitlementsLoading } = useEntitlementMap();
  const canViewOrders = can("ORDERS_VIEW");
  const canReceive = canAny("RECEIVING_VIEW", "RECEIVING_MANAGE");
  const ordersQuery = useOrders({ limit: "10" }, canViewOrders);
  const notificationsQuery = useNotifications();
  const receivingQuery = usePendingReceiving(canReceive);
  const suppliersQuery = useSuppliers(undefined, can("CATALOG_VIEW"));
  const cartItems = useCartStore((s) => s.items);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const refreshing =
    ordersQuery.isRefetching ||
    notificationsQuery.isRefetching ||
    receivingQuery.isRefetching ||
    suppliersQuery.isRefetching;
  const onRefresh = useCallback(() => {
    if (canViewOrders) void ordersQuery.refetch();
    void notificationsQuery.refetch();
    if (canReceive) void receivingQuery.refetch();
    if (can("CATALOG_VIEW")) void suppliersQuery.refetch();
  }, [
    ordersQuery.refetch,
    notificationsQuery.refetch,
    receivingQuery.refetch,
    suppliersQuery.refetch,
  ]);

  const orders = ordersQuery.data?.orders ?? [];
  const openOrders = orders.filter((order) =>
    ["PLACED", "ACKNOWLEDGED", "PROCESSING", "SHIPPED"].includes(order.status),
  );
  const readyToReceive = (receivingQuery.data?.orders ?? []).filter((o) =>
    ["DELIVERED", "COMPLETED"].includes(o.status),
  );
  const inTransit = openOrders.filter((o) => o.status === "SHIPPED");
  const openValue = moneyTotals(
    openOrders.map((order) => ({
      currency: order.currency,
      amount: Number(order.total_amount) || 0,
    })),
  )
    .map((entry) => formatMoney(entry.subtotal, entry.currency))
    .join(" + ");
  const unread = (notificationsQuery.data ?? []).filter((n) => !n.read).length;
  const toReceiveCount = receivingQuery.data?.orders?.length ?? 0;
  const workspaceTitle =
    user?.workspace?.tenantName ?? user?.displayName ?? "Restaurant";
  const branchLabel = user?.workspace?.roleName ?? undefined;

  const followedSuppliers = useMemo(
    () =>
      (suppliersQuery.data?.suppliers ?? [])
        .filter((s) => s.is_followed)
        .slice(0, 8),
    [suppliersQuery.data?.suppliers],
  );

  const attention: AttentionItem[] = [];
  if (
    canReceive &&
    isEnabled("receiving_quality") &&
    readyToReceive.length > 0
  ) {
    attention.push({
      key: "receive",
      title: uiCopy("{{v0}} ready to receive", { v0: readyToReceive.length }),
      subtitle: uiCopy("Confirm delivery and quality"),
      icon: "cube-outline",
      tone: "warning",
      onPress: () => navigation.navigate("ReceivingHub"),
    });
  }
  if (canViewOrders && inTransit.length > 0) {
    const first = inTransit[0];
    attention.push({
      key: "transit",
      title:
        inTransit.length === 1
          ? "Delivery in transit"
          : `${inTransit.length} deliveries in transit`,
      subtitle: first.supplier_name ?? "View order",
      icon: "navigate-outline",
      tone: "info",
      onPress: () =>
        inTransit.length === 1
          ? navigation.navigate("OrderDetail", { orderId: first.id })
          : navigation.navigate("Orders"),
    });
  }
  if (canViewOrders && openOrders.length > 0) {
    attention.push({
      key: "open",
      title: uiCopy("{{v0}} open order{{v1}}", {
        v0: openOrders.length,
        v1: openOrders.length === 1 ? "" : "s",
      }),
      subtitle: uiCopy("Among your 10 latest orders"),
      icon: "receipt-outline",
      tone: "info",
      onPress: () => navigation.navigate("Orders"),
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

  const nextAction =
    can("ORDERS_CREATE") && cartItems.length > 0
      ? {
          title: uiCopy("Resume cart"),
          subtitle: uiCopy("{{v0}} line{{v1}} · {{v2}} supplier(s)", {
            v0: cartItems.length,
            v1: cartItems.length === 1 ? "" : "s",
            v2: new Set(cartItems.map((i) => i.product.supplier_id)).size,
          }),
          icon: "cart-outline" as IoniconName,
          onPress: () => navigation.navigate("Cart"),
        }
      : canViewOrders && openOrders[0]
        ? {
            title: openOrders[0].supplier_name ?? "Open order",
            subtitle: `${openOrders[0].status} · ${formatMoney(openOrders[0].total_amount, openOrders[0].currency)}`,
            icon: "receipt-outline" as IoniconName,
            onPress: () =>
              navigation.navigate("OrderDetail", { orderId: openOrders[0].id }),
          }
        : can("CATALOG_VIEW")
          ? {
              title: uiCopy("Browse suppliers"),
              subtitle: uiCopy("Find products and place an order"),
              icon: "storefront-outline" as IoniconName,
              onPress: () => navigation.navigate("Shop"),
            }
          : null;

  const quickActions = useMemo(() => {
    const tiles: Array<{
      key: string;
      icon: IoniconName;
      label: string;
      onPress: () => void;
    }> = [];
    if (can("CATALOG_VIEW")) {
      tiles.push({
        key: "order",
        icon: "add-circle-outline",
        label: uiCopy("New order"),
        onPress: () => navigation.navigate("Shop"),
      });
    }
    if (
      can("ORDERS_CREATE") &&
      can("ORDERS_VIEW") &&
      !entitlementsLoading &&
      isEnabled("quick_lists")
    ) {
      tiles.push({
        key: "reorder",
        icon: "list-outline",
        label: uiCopy("Quick lists"),
        onPress: () => navigation.navigate("QuickLists"),
      });
    }
    if (
      can("INVOICES_VIEW") &&
      !entitlementsLoading &&
      isEnabled("finance_invoices")
    ) {
      tiles.push({
        key: "invoices",
        icon: "document-text-outline",
        label: uiCopy("Invoices"),
        onPress: () => navigation.navigate("Invoices"),
      });
    }
    if (
      can("CHAT_VIEW") &&
      can("CHAT_SEND") &&
      !entitlementsLoading &&
      isEnabled("chat")
    ) {
      tiles.push({
        key: "support",
        icon: "chatbubble-ellipses-outline",
        label: uiCopy("Messages"),
        onPress: () => navigation.navigate("Chat"),
      });
    }
    if (
      !entitlementsLoading &&
      isEnabled("reports") &&
      canAny("ORDERS_VIEW", "INVOICES_VIEW")
    ) {
      tiles.push({
        key: "reports",
        icon: "bar-chart-outline",
        label: uiCopy("Reports"),
        onPress: () => navigation.navigate("Reports"),
      });
    }
    if (can("RESERVATIONS_VIEW"))
      tiles.push({
        key: "reservations",
        icon: "calendar-outline",
        label: uiCopy("Reservations"),
        onPress: () => navigation.navigate("Reservations"),
      });
    if (can("INVENTORY_VIEW") && isEnabled("inventory_management"))
      tiles.push({
        key: "inventory",
        icon: "layers-outline",
        label: uiCopy("Inventory"),
        onPress: () => navigation.navigate("Inventory"),
      });
    return tiles;
  }, [can, canAny, entitlementsLoading, isEnabled, navigation, uiLocale]);

  const chrome = (
    <HomeChrome
      title={workspaceTitle}
      subtitle={branchLabel}
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
      workspaceLabel="Switch branch"
    />
  );

  if (
    ordersQuery.isLoading ||
    notificationsQuery.isLoading ||
    receivingQuery.isLoading
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

      {attention.length > 0 ? (
        <Text style={styles.statusLine}>
          {attention.length} {uiCopy("item")}{" "}
          {attention.length === 1 ? "" : "s"} {uiCopy("need attention")}
        </Text>
      ) : null}

      {canViewOrders || canReceive ? (
        <MetricStrip>
          {canViewOrders ? (
            <Metric
              value={ordersQuery.isError ? "—" : openOrders.length}
              label={uiCopy("Recent open orders")}
            />
          ) : null}
          {canReceive ? (
            <Metric
              value={receivingQuery.isError ? "—" : toReceiveCount}
              label={uiCopy("Receiving queue")}
              tone={readyToReceive.length > 0 ? "warning" : undefined}
            />
          ) : null}
          {canViewOrders && openOrders[0] ? (
            <Metric value={openValue} label={uiCopy("Recent open value")} />
          ) : null}
        </MetricStrip>
      ) : null}

      {canViewOrders ? (
        <Text style={styles.statusLine}>
          {uiCopy("Order figures cover your 10 latest orders.")}
        </Text>
      ) : null}

      {attention.length > 0 ? (
        <>
          <V2SectionHeader>{t("needsAttention")}</V2SectionHeader>
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
        </>
      ) : null}

      {nextAction ? (
        <>
          <V2SectionHeader>{t("upNext")}</V2SectionHeader>
          <NextAction
            title={nextAction.title}
            subtitle={nextAction.subtitle}
            onPress={nextAction.onPress}
          />
        </>
      ) : null}

      {quickActions.length > 0 ? (
        <>
          <V2SectionHeader>{uiCopy("Quick actions")}</V2SectionHeader>
          <View style={styles.quickRow}>
            {quickActions.map((tile) => (
              <V2QuickActionTile
                key={tile.key}
                icon={tile.icon}
                label={tile.label}
                onPress={tile.onPress}
              />
            ))}
          </View>
        </>
      ) : null}

      {can("CATALOG_VIEW") && followedSuppliers.length > 0 ? (
        <>
          <V2SectionHeader
            action="See all"
            onAction={() => navigation.navigate("Shop")}
          >
            {uiCopy("Following")}
          </V2SectionHeader>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.followedRow}
          >
            {followedSuppliers.map((supplier) => (
              <Pressable
                key={supplier.id}
                onPress={() =>
                  navigation.navigate("Catalog", {
                    supplierId: supplier.id,
                    supplierName: supplier.name,
                  })
                }
                style={styles.followedChip}
                accessibilityRole="button"
              >
                <View style={styles.followedAvatar}>
                  <Text style={styles.followedLetter}>
                    {(supplier.name.trim()[0] ?? "?").toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.followedName} numberOfLines={1}>
                  {supplier.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {canViewOrders ? (
        <>
          <SectionHeader
            action={orders.length > 0 ? "See all" : undefined}
            onAction={
              orders.length > 0
                ? () => navigation.navigate("Orders")
                : undefined
            }
          >
            {t("recent")}
          </SectionHeader>
          {ordersQuery.isError ? (
            <ErrorState
              message={uiCopy("Could not load your orders.")}
              onRetry={() => void ordersQuery.refetch()}
            />
          ) : orders.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title={t("noOpenOrders")}
              message={uiCopy("Orders you place will appear here.")}
            />
          ) : (
            orders
              .slice(0, 8)
              .map((order) => (
                <V2OrderRow
                  key={order.id}
                  title={order.supplier_name ?? uiCopy("Order")}
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
        </>
      ) : null}
      <BranchPickerSheet
        visible={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  statusLine: {
    ...type.caption,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.sm,
    color: colors.textMuted,
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.md,
  },
  followedRow: {
    paddingHorizontal: theme.gutter,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  followedChip: {
    width: 72,
    alignItems: "center",
    gap: 6,
  },
  followedAvatar: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  followedLetter: { fontSize: 16, fontWeight: "700", color: colors.brandDark },
  followedName: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
    width: "100%",
  },
});
