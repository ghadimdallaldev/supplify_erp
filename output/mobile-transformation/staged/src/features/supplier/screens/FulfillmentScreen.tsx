import { SplitView } from "../../../components/layout/SplitView";
import { useAdaptiveLayout } from "../../../theme/responsive";
import { usePermissions } from "../../../hooks/usePermissions";
import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { Sheet as DesignSheet } from "../../../components/ui/Sheet";
import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useAssignDriver,
  useFulfillmentDispatch,
  useFulfillmentDrivers,
  useReassignDriver,
  useRolloverAssignment,
  useRetryFailedDelivery,
} from "../../../services/api/queries";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FlashList,
  ListRow,
  LoadingState,
  Screen,
  StatusPill,
} from "../../../components/ui";
import { formatMoney } from "../../../utils/format";
import type { DispatchOrderCard } from "../../../types/orders-ext";
import { colors, theme, type } from "../../../theme";

type DriverMode = "assign" | "reassign" | "retry";

export function FulfillmentScreen() {
  useUiLocale();

  const { data, isLoading, isError, refetch } = useFulfillmentDispatch();
  const { data: driversData } = useFulfillmentDrivers();
  const assignDriver = useAssignDriver();
  const reassignDriver = useReassignDriver();
  const rollover = useRolloverAssignment();
  const retryDelivery = useRetryFailedDelivery();

  const { wide } = useAdaptiveLayout();
  const { can } = usePermissions();
  const canManage = can("FULFILLMENT_MANAGE");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DispatchOrderCard | null>(
    null,
  );
  const [driverMode, setDriverMode] = useState<DriverMode>("assign");
  const [retryReason, setRetryReason] = useState("");

  const orders = data?.orders ?? [];
  const drivers = driversData?.drivers ?? [];

  const openDriverPicker = (order: DispatchOrderCard, mode: DriverMode) => {
    if (!canManage) return;
    setSelectedOrder(order);
    setDriverMode(mode);
    setRetryReason("");
    setDriverModalVisible(true);
  };

  const closeDriverPicker = () => {
    setDriverModalVisible(false);
    setSelectedOrder(null);
    setRetryReason("");
  };

  const driverLabel = (d: { full_name?: string; fullName?: string }) =>
    d.full_name ?? d.fullName ?? "Driver";

  const pickDriver = (driverId: string) => {
    if (
      !canManage ||
      !selectedOrder ||
      assignDriver.isPending ||
      reassignDriver.isPending ||
      retryDelivery.isPending
    )
      return;
    const orderId = selectedOrder.id;
    const onDone = () => {
      closeDriverPicker();
      void refetch();
    };
    const onError = (e: unknown) => {
      Alert.alert(
        uiCopy("Error"),
        e instanceof Error ? e.message : uiCopy("Could not update driver"),
      );
    };

    if (driverMode === "reassign" && retryReason.trim().length < 3) {
      Alert.alert(
        uiCopy("Reassignment reason required"),
        uiCopy("Enter at least 3 characters explaining the reassignment."),
      );
      return;
    }

    if (driverMode === "retry") {
      if (!retryReason.trim() || retryReason.trim().length < 3) {
        Alert.alert(
          uiCopy("Retry reason required"),
          uiCopy(
            "Enter at least 3 characters explaining the new delivery attempt.",
          ),
        );
        return;
      }
      if (!selectedOrder.assignment?.id) {
        Alert.alert(
          uiCopy("Cannot retry"),
          uiCopy("The failed delivery attempt is no longer available."),
        );
        return;
      }
      retryDelivery.mutate(
        {
          orderId,
          source_driver_assignment_id: selectedOrder.assignment.id,
          driver_id: driverId,
          reason: retryReason.trim(),
        },
        { onSuccess: onDone, onError },
      );
      return;
    }

    if (driverMode === "assign") {
      assignDriver.mutate(
        {
          orderId,
          driver_id: driverId,
          warehouse_assignment_id:
            selectedOrder?.assignment?.warehouse_assignment_id,
        },
        { onSuccess: onDone, onError },
      );
    } else {
      reassignDriver.mutate(
        {
          orderId,
          driver_id: driverId,
          reason: retryReason.trim(),
          driver_assignment_id: selectedOrder?.assignment?.id,
          warehouse_assignment_id:
            selectedOrder?.assignment?.warehouse_assignment_id,
        },
        { onSuccess: onDone, onError },
      );
    }
  };

  const confirmRollover = (order: DispatchOrderCard) => {
    const assignmentId = order.assignment?.id;
    if (!assignmentId) {
      Alert.alert(
        uiCopy("Cannot move"),
        uiCopy("This order has no active assignment."),
      );
      return;
    }
    Alert.alert(
      uiCopy("Move to tomorrow"),
      uiCopy("Move delivery for {{v0}} to tomorrow?", {
        v0: order.restaurant_name,
      }),
      [
        { text: uiCopy("Cancel"), style: "cancel" },
        {
          text: uiCopy("Move"),
          onPress: () => {
            rollover.mutate(assignmentId, {
              onSuccess: () => void refetch(),
              onError: (e) =>
                Alert.alert(
                  uiCopy("Error"),
                  e instanceof Error ? e.message : uiCopy("Could not rollover"),
                ),
            });
          },
        },
      ],
    );
  };

  const busy =
    assignDriver.isPending ||
    reassignDriver.isPending ||
    rollover.isPending ||
    retryDelivery.isPending;

  if (isLoading) return <LoadingState />;
  if (isError)
    return (
      <Screen title={uiCopy("Dispatch")}>
        <ErrorState
          message={uiCopy("Could not load deliveries.")}
          onRetry={() => void refetch()}
        />
      </Screen>
    );

  const master = (
    <Screen
      title={uiCopy("Dispatch")}
      subtitle={uiCopy("{{v0}} orders", { v0: orders.length })}
      padded={false}
    >
      <FlashList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => (
          <View style={{ height: theme.spacing.sm }} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="car-outline"
            title={uiCopy("Nothing to dispatch")}
            message={uiCopy(
              "Fulfilled orders waiting for driver assignment will appear here.",
            )}
          />
        }
        renderItem={({ item }) =>
          wide ? (
            <ListRow
              title={item.restaurant_name ?? uiCopy("Order")}
              subtitle={item.warehouse_name ?? item.delivery_area ?? undefined}
              right={
                <StatusPill
                  status={item.delivery_status ?? item.assignment?.status}
                  domain="delivery"
                />
              }
              onPress={() => setFocusedId(item.id)}
            />
          ) : (
            <DispatchCard
              order={item}
              busy={busy || !canManage}
              onAssign={() => openDriverPicker(item, "assign")}
              onReassign={() => openDriverPicker(item, "reassign")}
              onRetry={() => openDriverPicker(item, "retry")}
              onRollover={() => confirmRollover(item)}
            />
          )
        }
      />

      <DesignSheet
        visible={driverModalVisible}
        dismissible={!busy}
        onClose={() => {
          if (!busy) closeDriverPicker();
        }}
      >
        <Text style={styles.sheetTitle}>
          {driverMode === "assign"
            ? uiCopy("Assign driver")
            : driverMode === "retry"
              ? uiCopy("Retry delivery")
              : uiCopy("Reassign driver")}
        </Text>
        {selectedOrder ? (
          <Text style={styles.sheetSub}>{selectedOrder.restaurant_name}</Text>
        ) : null}
        {driverMode !== "assign" ? (
          <TextInput
            style={styles.reasonInput}
            placeholder={uiCopy("Reason required for this action")}
            value={retryReason}
            onChangeText={setRetryReason}
            multiline
          />
        ) : null}
        {drivers.length === 0 ? (
          <Text style={styles.sheetMeta}>{uiCopy("No drivers available")}</Text>
        ) : (
          drivers.map((d) => (
            <ListRow
              key={d.id}
              icon="person-outline"
              iconTone="brand"
              title={driverLabel(d)}
              onPress={() => pickDriver(d.id)}
              style={busy ? { opacity: 0.6 } : undefined}
            />
          ))
        )}
        <Button
          label={uiCopy("Cancel")}
          variant="outline"
          onPress={closeDriverPicker}
          style={styles.cancelBtn}
        />
      </DesignSheet>
    </Screen>
  );
  const focused = orders.find((order) => order.id === focusedId);
  return (
    <SplitView
      master={master}
      detail={
        focused ? (
          <View style={{ padding: 24 }}>
            <DispatchCard
              order={focused}
              busy={busy || !canManage}
              onAssign={() => openDriverPicker(focused, "assign")}
              onReassign={() => openDriverPicker(focused, "reassign")}
              onRetry={() => openDriverPicker(focused, "retry")}
              onRollover={() => {
                if (canManage) confirmRollover(focused);
              }}
            />
          </View>
        ) : (
          <EmptyState
            icon="car-outline"
            title={uiCopy("Dispatch")}
            message={uiCopy(
              "Choose a delivery to review its warehouse, driver, and next action.",
            )}
          />
        )
      }
    />
  );
}

function DispatchCard({
  order,
  busy,
  onAssign,
  onReassign,
  onRetry,
  onRollover,
}: {
  order: DispatchOrderCard;
  busy: boolean;
  onAssign: () => void;
  onReassign: () => void;
  onRetry: () => void;
  onRollover: () => void;
}) {
  useUiLocale();

  const hasDriver = Boolean(
    order.assignment?.driver_id ?? order.assignment?.driver_name,
  );
  const deliveryStatus =
    order.delivery_status ?? order.assignment?.status ?? "pending";

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.name} numberOfLines={1}>
          {order.restaurant_name ?? uiCopy("Order")}
        </Text>
        <StatusPill status={deliveryStatus} domain="delivery" />
      </View>
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="cube-outline" size={14} color={colors.textMuted} />
          <Text style={styles.meta}>
            {order.item_count} {uiCopy("items")}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
          <Text style={styles.meta}>{formatMoney(order.total_amount)}</Text>
        </View>
        {order.delivery_area ? (
          <View style={styles.metaItem}>
            <Ionicons
              name="location-outline"
              size={14}
              color={colors.textMuted}
            />
            <Text style={styles.meta}>{order.delivery_area}</Text>
          </View>
        ) : null}
        {order.warehouse_name || order.warehouse_code ? (
          <View style={styles.metaItem}>
            <Ionicons
              name="business-outline"
              size={14}
              color={colors.textMuted}
            />
            <Text style={styles.meta}>
              {order.multi_warehouse && (order.warehouse_count || 0) > 1
                ? `${order.warehouse_name || order.warehouse_code} (+${(order.warehouse_count || 1) - 1})`
                : order.warehouse_name || order.warehouse_code}
            </Text>
          </View>
        ) : null}
      </View>
      {hasDriver ? (
        <Text style={styles.driver}>
          {uiCopy("Driver:")}{" "}
          {order.assignment?.driver_name ?? uiCopy("Assigned")}
        </Text>
      ) : (
        <Text style={styles.driverMuted}>{uiCopy("No driver assigned")}</Text>
      )}
      <View style={styles.actions}>
        {deliveryStatus === "failed" ? (
          <Button
            label={uiCopy("Retry delivery")}
            variant="primary"
            icon="refresh-outline"
            onPress={onRetry}
            disabled={busy}
            style={styles.actionBtn}
          />
        ) : hasDriver ? (
          <Button
            label={uiCopy("Reassign")}
            variant="outline"
            icon="swap-horizontal-outline"
            onPress={onReassign}
            disabled={busy}
            style={styles.actionBtn}
          />
        ) : (
          <Button
            label={uiCopy("Assign")}
            variant="primary"
            icon="person-add-outline"
            onPress={onAssign}
            disabled={busy}
            style={styles.actionBtn}
          />
        )}
        {order.assignment?.id ? (
          <Button
            label={uiCopy("Tomorrow")}
            variant="ghost"
            icon="calendar-outline"
            onPress={onRollover}
            disabled={busy}
            style={styles.actionBtn}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xxl,
  },
  card: { marginBottom: 0 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  name: { ...type.title, flex: 1 },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  driver: { ...type.label, marginTop: theme.spacing.sm, color: colors.brand },
  driverMuted: { ...type.label, marginTop: theme.spacing.sm },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  actionBtn: { flexGrow: 1, minWidth: 120 },
  reasonInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    minHeight: 44,
    color: colors.text,
    marginBottom: theme.spacing.sm,
  },
  backdrop: { flex: 1, backgroundColor: colors.backdropDark },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    maxHeight: "70%",
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
  sheetSub: { ...type.label, marginTop: 4, marginBottom: theme.spacing.md },
  sheetMeta: { color: colors.textMuted, marginBottom: theme.spacing.md },
  cancelBtn: { marginTop: theme.spacing.md },
});
