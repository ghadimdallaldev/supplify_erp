import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RestaurantStackParamList } from "../../../navigation/RestaurantNavigator";
import {
  useOrder,
  useOrderAmendments,
  useOrderTracking,
} from "../../../services/api/queries";
import { DeliveryTrackingMap } from "../../../components/maps/DeliveryTrackingMap";
import { pointsFromTracking } from "../../../utils/deliveryMapUtils";
import {
  Button,
  EmptyState,
  LoadingState,
  Screen,
  StatusPill,
} from "../../../components/ui";
import { V2ProductRow, V2SectionHeader } from "../../../components/ui/v2";
import {
  getEtaUnavailableMessage,
  getGpsStatusLabel,
  getRestaurantEtaPrimaryText,
  getRestaurantEtaSecondaryText,
} from "../../../utils/deliveryEtaDisplay";
import { usePermissions } from "../../../hooks/usePermissions";
import { isOrderEligibleForDispute } from "../../../utils/orderDisputeEligibility";
import { isRestaurantOrderTracking } from "../../../types/supplify";
import { formatMoney, orderShortId } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";

function amendmentChangeLabel(amendment: {
  change_type?: string | null;
  changeType?: string | null;
}): string {
  return String(
    amendment.change_type ?? amendment.changeType ?? "change",
  ).replaceAll("_", " ");
}

export function OrderDetailScreen() {
  useUiLocale();

  const { params } =
    useRoute<RouteProp<RestaurantStackParamList, "OrderDetail">>();
  return <OrderDetailContent orderId={params.orderId} />;
}

export function OrderDetailContent({ orderId }: { orderId: string }) {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>();
  const { can } = usePermissions();
  const { data: order, isLoading, isError } = useOrder(orderId);
  const { data: amendmentData } = useOrderAmendments(orderId);
  const showTracking =
    order?.status === "SHIPPED" || order?.status === "PROCESSING";
  const { data: trackingRaw } = useOrderTracking(
    orderId,
    showTracking ? 30_000 : undefined,
  );

  const tracking = isRestaurantOrderTracking(trackingRaw)
    ? trackingRaw
    : undefined;
  const { driverPoint } = useMemo(
    () => pointsFromTracking(tracking?.tracking),
    [tracking?.tracking],
  );

  if (isLoading) return <LoadingState />;
  if (isError || !order?.id)
    return (
      <Screen title={uiCopy("Order")} scroll>
        <EmptyState
          icon="cloud-offline-outline"
          title={uiCopy("Order not found")}
          message={uiCopy(
            "This order could not be loaded. It may have been removed or there was a connection issue.",
          )}
        />
      </Screen>
    );

  const etaPrimary = getRestaurantEtaPrimaryText(tracking);
  const etaSecondary = getRestaurantEtaSecondaryText(tracking);
  const etaUnavailable = getEtaUnavailableMessage(tracking);
  // API POST /api/receiving/receive requires RECEIVING_MANAGE (same as web).
  const canReceive =
    can("RECEIVING_MANAGE") &&
    (order.status === "DELIVERED" || order.status === "COMPLETED");
  const canDispute =
    can("ORDERS_MANAGE") && isOrderEligibleForDispute(order.status);

  return (
    <Screen
      title={order.supplier_name ?? uiCopy("Order")}
      scroll
      padded={false}
    >
      <View style={styles.statusBlock}>
        <View style={styles.headerRow}>
          <Text style={type.h2}>
            {uiCopy("Order")} {orderShortId(order.id)}
          </Text>
          <StatusPill status={order.status} domain="order" />
        </View>
        <Text style={styles.meta}>
          {uiCopy("Placed")} {new Date(order.created_at).toLocaleDateString()} ·{" "}
          {formatMoney(order.total_amount, order.currency)}
        </Text>
      </View>

      {showTracking && tracking?.trackingEnabled ? (
        <View style={styles.trackingBlock}>
          <V2SectionHeader style={styles.inlineSection}>
            {uiCopy("Live tracking")}
          </V2SectionHeader>
          <View style={styles.trackingBody}>
            {etaPrimary ? <Text style={styles.eta}>{etaPrimary}</Text> : null}
            {etaSecondary ? (
              <Text style={styles.meta}>{etaSecondary}</Text>
            ) : null}
            {etaUnavailable ? (
              <Text style={styles.meta}>{etaUnavailable}</Text>
            ) : null}
            <Text style={styles.meta}>
              {getGpsStatusLabel(tracking?.tracking)}
            </Text>
            {tracking?.tracking?.lastUpdatedLabel ? (
              <Text style={styles.meta}>
                {uiCopy("Updated")} {tracking.tracking.lastUpdatedLabel}
              </Text>
            ) : null}
            {driverPoint ? (
              <DeliveryTrackingMap
                driverPoint={driverPoint}
                showDestinationPin={false}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <V2SectionHeader>{uiCopy("Items")}</V2SectionHeader>
      {(Array.isArray(order.items) ? order.items : []).map((item) => (
        <V2ProductRow
          key={item.id}
          name={item.product_name ?? item.product_id}
          meta={uiCopy("Qty {{v0}}", { v0: item.quantity })}
          price={formatMoney(item.line_total, order.currency)}
        />
      ))}

      {(amendmentData?.amendments ?? []).length > 0 ? (
        <>
          <V2SectionHeader>{uiCopy("Order changes")}</V2SectionHeader>
          {(amendmentData?.amendments ?? []).map((amendment) => (
            <View key={amendment.id} style={styles.amendmentRow}>
              <Text style={type.title}>
                {amendment.description || uiCopy("Order change")}
              </Text>
              <Text style={styles.meta}>
                {amendmentChangeLabel(amendment)} ·{" "}
                {amendment.status ?? uiCopy("unknown")}
              </Text>
              {(Array.isArray(amendment.items) ? amendment.items : []).map(
                (item) => (
                  <Text key={item.id} style={styles.meta}>
                    {item.requestedQuantity != null
                      ? uiCopy("Requested quantity: {{v0}}", {
                          v0: item.requestedQuantity,
                        })
                      : item.substituteProductId
                        ? uiCopy("Replacement product proposed")
                        : item.notes || uiCopy("Line-item change")}
                  </Text>
                ),
              )}
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.actions}>
        {canReceive ? (
          <Button
            label={uiCopy("Receive order")}
            icon="cube-outline"
            variant="success"
            onPress={() =>
              navigation.navigate("Receive", { orderId: order.id })
            }
            style={styles.action}
          />
        ) : null}

        {canDispute ? (
          <Button
            label={uiCopy("Open dispute")}
            icon="shield-outline"
            variant="outline"
            onPress={() =>
              navigation.navigate("CreateDispute", { orderId: order.id })
            }
            style={styles.action}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusBlock: {
    marginHorizontal: theme.gutter,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  meta: { ...type.label, marginTop: 4 },
  trackingBlock: { marginBottom: theme.spacing.sm },
  trackingBody: {
    marginHorizontal: theme.gutter,
    padding: theme.spacing.md,
    backgroundColor: colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    gap: 2,
  },
  inlineSection: { marginTop: 0 },
  eta: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.brand,
    marginBottom: 4,
  },
  amendmentRow: {
    paddingHorizontal: theme.gutter,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.hairline,
    borderBottomColor: colors.separator,
    backgroundColor: colors.surface,
  },
  actions: {
    paddingHorizontal: theme.gutter,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  action: { marginTop: 0 },
});
