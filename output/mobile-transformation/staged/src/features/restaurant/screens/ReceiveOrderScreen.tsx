import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RestaurantStackParamList } from "../../../navigation/RestaurantNavigator";
import { useOrder, useReceiveOrder } from "../../../services/api/queries";
import { ApiError } from "../../../services/api/client";
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
} from "../../../components/ui";
import { usePermissions } from "../../../hooks/usePermissions";
import { colors, theme } from "../../../theme";

export function ReceiveOrderScreen() {
  useUiLocale();

  const { params } = useRoute<RouteProp<RestaurantStackParamList, "Receive">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>();
  const { can } = usePermissions();
  const orderId = params.orderId;
  const { data: order, isLoading, isError } = useOrder(orderId ?? "");
  const receive = useReceiveOrder();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [qualities, setQualities] = useState<
    Record<string, "ACCEPTED" | "DAMAGED" | "EXPIRED" | "WRONG_ITEM" | "SHORT">
  >({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!can("RECEIVING_MANAGE")) {
    return (
      <Screen form title={uiCopy("Receive order")} scroll>
        <EmptyState
          icon="lock-closed-outline"
          title={uiCopy("Permission required")}
          message={uiCopy(
            "You need receive permission (RECEIVING_MANAGE) to create a receiving report.",
          )}
        />
      </Screen>
    );
  }

  if (!orderId) {
    return (
      <Screen form title={uiCopy("Receive order")} scroll>
        <EmptyState
          title={uiCopy("Select an order")}
          message={uiCopy("Open an order first, then tap Receive.")}
        />
      </Screen>
    );
  }
  if (isLoading) return <LoadingState />;
  if (isError || !order?.id) {
    return (
      <Screen form title={uiCopy("Receive order")} scroll>
        <EmptyState
          icon="cloud-offline-outline"
          title={uiCopy("Order not found")}
          message={uiCopy("This order could not be loaded.")}
        />
      </Screen>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];

  const submitReceiving = async () => {
    if (!items.length) {
      Alert.alert(
        uiCopy("No line items"),
        uiCopy("This order has no lines to receive."),
      );
      return;
    }
    try {
      await receive.mutateAsync({
        orderId: order.id,
        lineItems: items.map((item) => ({
          orderItemId: item.id,
          receivedQuantity: Number(quantities[item.id] ?? item.quantity),
          qualityStatus: qualities[item.id] ?? "ACCEPTED",
          notes: notes[item.id],
        })),
      });
      Alert.alert(uiCopy("Received"), uiCopy("Order marked as received."), [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const details =
        e instanceof ApiError && e.details != null
          ? String(e.details)
          : e instanceof Error
            ? e.message
            : "Could not receive order";
      Alert.alert(uiCopy("Could not create receiving report"), details);
    }
  };

  return (
    <Screen
      form
      title={uiCopy("Receive order")}
      subtitle={order.supplier_name ?? undefined}
      scroll
    >
      <Card>
        <Text style={styles.meta}>
          {uiCopy("Record the actual quantity and quality for every line.")}
        </Text>
      </Card>
      {items.length === 0 ? (
        <EmptyState
          title={uiCopy("No line items")}
          message={uiCopy("This order has nothing to receive.")}
        />
      ) : (
        items.map((item) => (
          <Card key={item.id}>
            <Text style={styles.item}>
              {item.product_name ?? item.product_id}
            </Text>
            <Text style={styles.meta}>
              {uiCopy("Expected:")} {item.quantity}
            </Text>
            <Text style={styles.label}>{uiCopy("Actual quantity")}</Text>
            <TextInput
              value={quantities[item.id] ?? String(item.quantity)}
              onChangeText={(value) =>
                setQuantities((current) => ({ ...current, [item.id]: value }))
              }
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Button
              label={uiCopy("Quality: {{v0}}", {
                v0: qualities[item.id] ?? "ACCEPTED",
              })}
              variant={
                (qualities[item.id] ?? "ACCEPTED") === "ACCEPTED"
                  ? "outline"
                  : "danger"
              }
              onPress={() => {
                const options = [
                  "ACCEPTED",
                  "DAMAGED",
                  "EXPIRED",
                  "WRONG_ITEM",
                  "SHORT",
                ] as const;
                const current = qualities[item.id] ?? "ACCEPTED";
                const next =
                  options[(options.indexOf(current) + 1) % options.length];
                setQualities((values) => ({ ...values, [item.id]: next }));
              }}
              style={styles.control}
            />
            <TextInput
              value={notes[item.id] ?? ""}
              onChangeText={(value) =>
                setNotes((current) => ({ ...current, [item.id]: value }))
              }
              placeholder={uiCopy("Line notes (optional)")}
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
          </Card>
        ))
      )}
      <View style={styles.footer}>
        <Button
          label={
            receive.isPending ? uiCopy("Saving…") : uiCopy("Complete receiving")
          }
          onPress={() => void submitReceiving()}
          loading={receive.isPending}
          disabled={
            receive.isPending ||
            items.length === 0 ||
            items.some((item) => {
              const value = Number(quantities[item.id] ?? item.quantity);
              return (
                !Number.isFinite(value) ||
                value < 0 ||
                value > Number(item.quantity)
              );
            })
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { color: colors.textMuted, marginTop: 2 },
  item: { fontWeight: "600", color: colors.text },
  label: {
    color: colors.textMuted,
    marginTop: 10,
    marginBottom: 4,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.sm,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  control: { marginTop: 8 },
  footer: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.xl },
});
