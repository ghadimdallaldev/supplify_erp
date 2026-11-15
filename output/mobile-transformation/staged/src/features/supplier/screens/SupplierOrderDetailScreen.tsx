import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useRoute } from "@react-navigation/native";
import type { SupplierStackParamList } from "../../../navigation/SupplierNavigator";
import {
  useOrder,
  useOrderAmendments,
  useOrderTracking,
  useReportOrderShortage,
  useUpdateOrder,
} from "../../../services/api/queries";
import { DeliveryTrackingMap } from "../../../components/maps/DeliveryTrackingMap";
import { pointsFromTracking } from "../../../utils/deliveryMapUtils";
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  StatusPill,
  SectionHeader,
  Divider,
} from "../../../components/ui";
import { formatMoney, formatShortDate } from "../../../utils/format";
import {
  getEtaUnavailableMessage,
  getGpsStatusLabel,
  getSupplierEtaPrimaryText,
  getSupplierEtaSecondaryText,
} from "../../../utils/deliveryEtaDisplay";
import {
  isRestaurantOrderTracking,
  type SupplierOrderTrackingResponse,
} from "../../../types/supplify";
import { usePermissions } from "../../../hooks/usePermissions";
import { colors, theme, type } from "../../../theme";

function amendmentChangeLabel(amendment: {
  change_type?: string | null;
  changeType?: string | null;
}): string {
  return String(
    amendment.change_type ?? amendment.changeType ?? "change",
  ).replaceAll("_", " ");
}

const NEXT_STATUSES: Record<string, string> = {
  PLACED: "ACKNOWLEDGED",
  ACKNOWLEDGED: "PROCESSING",
  PROCESSING: "SHIPPED",
};

export function SupplierOrderDetailScreen() {
  useUiLocale();

  const { params } =
    useRoute<RouteProp<SupplierStackParamList, "OrderDetail">>();
  return <SupplierOrderDetailContent orderId={params.orderId} />;
}

export function SupplierOrderDetailContent({ orderId }: { orderId: string }) {
  useUiLocale();

  const { can, canAny } = usePermissions();
  const { data: order, isLoading, isError } = useOrder(orderId);
  const { data: amendmentData } = useOrderAmendments(orderId);
  const updateOrder = useUpdateOrder();
  const reportShortage = useReportOrderShortage();
  const activeDelivery = order?.status === "SHIPPED";
  const { data: trackingRaw } = useOrderTracking(
    orderId,
    activeDelivery ? 15_000 : undefined,
  );
  const tracking: SupplierOrderTrackingResponse | undefined =
    trackingRaw && !isRestaurantOrderTracking(trackingRaw)
      ? trackingRaw
      : undefined;

  const mapPoints = useMemo(
    () =>
      pointsFromTracking(
        tracking?.tracking,
        tracking?.destination?.latitude,
        tracking?.destination?.longitude,
      ),
    [tracking],
  );

  if (isLoading) return <LoadingState />;
  if (isError || !order?.id) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title={uiCopy("Order not found")}
        message={uiCopy(
          "This order could not be loaded. It may have been removed or there was a connection issue.",
        )}
      />
    );
  }

  const next = NEXT_STATUSES[order.status];

  const advance = async () => {
    if (!next) return;
    try {
      await updateOrder.mutateAsync({ id: order.id, status: next });
    } catch (e) {
      Alert.alert(
        uiCopy("Error"),
        e instanceof Error ? e.message : uiCopy("Update failed"),
      );
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { width: "100%", maxWidth: 760, alignSelf: "center" },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={2}>
            {order.customer_display_name ||
              order.restaurant_name ||
              uiCopy("Customer")}
          </Text>
          <StatusPill
            status={
              order.requested_delivery_method === "PICKUP" &&
              order.status === "SHIPPED"
                ? "READY FOR PICKUP"
                : order.requested_delivery_method === "PICKUP" &&
                    order.status === "DELIVERED"
                  ? "PICKED UP"
                  : order.status
            }
            domain="order"
          />
        </View>
        <Divider />
        <View style={styles.kv}>
          <View style={styles.kvIcon}>
            <Ionicons name="cash-outline" size={18} color={colors.success} />
          </View>
          <Text style={styles.kvLabel}>{uiCopy("Total")}</Text>
          <Text style={styles.kvValue}>
            {formatMoney(order.total_amount, order.currency)}
          </Text>
        </View>
        {formatShortDate(order.created_at) ? (
          <View style={styles.kv}>
            <View style={styles.kvIcon}>
              <Ionicons name="time-outline" size={18} color={colors.info} />
            </View>
            <Text style={styles.kvLabel}>{uiCopy("Placed")}</Text>
            <Text style={styles.kvValue}>
              {formatShortDate(order.created_at)}
            </Text>
          </View>
        ) : null}
        {order.customer_type && order.customer_type !== "RESTAURANT" ? (
          <>
            <Divider />
            <Text style={type.title}>
              {order.customer_type} · {order.requested_delivery_method}
            </Text>
            <Text style={styles.etaSub}>
              {order.customer_contact_snapshot?.name} ·{" "}
              {order.customer_contact_snapshot?.phone}
            </Text>
            <Text style={styles.etaSub}>
              {order.customer_contact_snapshot?.email || uiCopy("No email")} ·{" "}
              {order.checkout_payment_method?.replace(/_/g, " ")}
            </Text>
            <Text style={styles.etaSub}>
              {uiCopy("Subtotal")}{" "}
              {formatMoney(order.subtotal_amount || 0, order.currency)}{" "}
              {uiCopy("· Delivery")}{" "}
              {formatMoney(order.delivery_fee || 0, order.currency)}
            </Text>
          </>
        ) : null}
        {next && can("ORDERS_MANAGE") ? (
          <Button
            label={uiCopy("Mark {{v0}}", { v0: next.toLowerCase() })}
            icon="arrow-forward-circle-outline"
            onPress={advance}
            loading={updateOrder.isPending}
            style={styles.cta}
          />
        ) : null}
      </Card>

      <SectionHeader>{uiCopy("Items")}</SectionHeader>
      {(Array.isArray(order.items) ? order.items : []).map((item) => (
        <Card key={item.id}>
          <Text style={type.title}>{item.product_name ?? item.product_id}</Text>
          <Text style={styles.etaSub}>
            {uiCopy("Ordered:")} {item.quantity}
          </Text>
          {canAny("ORDERS_MANAGE", "FULFILLMENT_MANAGE") &&
          ["PLACED", "PENDING_APPROVAL", "ACKNOWLEDGED", "PROCESSING"].includes(
            order.status,
          ) ? (
            <Button
              label={uiCopy("Report unavailable")}
              variant={"outline"}
              loading={reportShortage.isPending}
              onPress={() => {
                Alert.alert(
                  uiCopy("Report shortage"),
                  uiCopy("Tell the customer this entire line is unavailable?"),
                  [
                    { text: uiCopy("Cancel"), style: "cancel" },
                    {
                      text: uiCopy("Report"),
                      style: "destructive",
                      onPress: () => {
                        void reportShortage
                          .mutateAsync({
                            orderId: order.id,
                            orderItemId: item.id,
                            orderedQuantity: Number(item.quantity),
                          })
                          .catch((error) =>
                            Alert.alert(
                              uiCopy("Error"),
                              error instanceof Error
                                ? error.message
                                : uiCopy("Could not report shortage"),
                            ),
                          );
                      },
                    },
                  ],
                );
              }}
            />
          ) : null}
        </Card>
      ))}

      {(amendmentData?.amendments ?? []).length > 0 ? (
        <Card>
          <SectionHeader>{uiCopy("Order changes")}</SectionHeader>
          {(amendmentData?.amendments ?? []).map((amendment) => (
            <View key={amendment.id} style={styles.amendment}>
              <Text style={type.title}>
                {amendment.description || uiCopy("Order change")}
              </Text>
              <Text style={styles.etaSub}>
                {amendmentChangeLabel(amendment)} ·{" "}
                {amendment.status ?? uiCopy("unknown")}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {activeDelivery && tracking?.trackingEnabled ? (
        <Card>
          <SectionHeader>{uiCopy("Live tracking")}</SectionHeader>
          <View style={styles.gpsRow}>
            <Ionicons name="radio-outline" size={16} color={colors.brand} />
            <Text style={styles.gpsLabel}>
              {getGpsStatusLabel(tracking.tracking)}
            </Text>
          </View>
          <Text style={styles.eta}>
            {getSupplierEtaPrimaryText(tracking) ??
              getEtaUnavailableMessage(tracking)}
          </Text>
          <Text style={styles.etaSub}>
            {getSupplierEtaSecondaryText(tracking)}
          </Text>
          <View style={styles.mapWrap}>
            <DeliveryTrackingMap
              driverPoint={mapPoints.driverPoint}
              destinationPoint={mapPoints.destinationPoint}
              showDestinationPin
            />
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: theme.spacing.md, gap: theme.spacing.xs },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  title: { ...type.h2, flex: 1 },
  kv: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: 6,
  },
  kvIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  kvLabel: { ...type.label, flex: 1 },
  kvValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  cta: { marginTop: theme.spacing.md },
  gpsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: theme.spacing.xs,
  },
  gpsLabel: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  eta: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.brand,
    letterSpacing: -0.3,
  },
  etaSub: {
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: theme.spacing.sm,
    fontWeight: "500",
  },
  mapWrap: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
    marginTop: theme.spacing.xs,
  },
  amendment: { paddingVertical: theme.spacing.xs },
});
