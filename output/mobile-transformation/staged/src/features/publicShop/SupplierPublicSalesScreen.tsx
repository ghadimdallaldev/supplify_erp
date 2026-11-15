import { Text, TextInput } from "../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { useEffect, useState } from "react";
import { Alert, Share, StyleSheet, Switch, View } from "react-native";
import { Button, Card, LoadingState, Screen } from "../../components/ui";
import { colors, theme, type } from "../../theme";
import { useSupplierPublicSales, useUpdateSupplierPublicSales } from "./api";
import type { PublicPaymentMethod } from "./types";

const METHODS: PublicPaymentMethod[] = [
  "CASH_ON_DELIVERY",
  "CASH_ON_PICKUP",
  "BANK_TRANSFER",
];

export function SupplierPublicSalesScreen() {
  useUiLocale();

  const query = useSupplierPublicSales();
  const update = useUpdateSupplierPublicSales();
  const [enabled, setEnabled] = useState(false);
  const [deliveryWarehouseIds, setDeliveryWarehouseIds] = useState<string[]>(
    [],
  );
  const [pickupWarehouseId, setPickupWarehouseId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PublicPaymentMethod[]>(
    [],
  );
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    const config = query.data?.config;
    if (!config) return;
    setEnabled(Boolean(config.enabled));
    setDeliveryWarehouseIds(config.deliveryWarehouseIds || []);
    setPickupWarehouseId(config.pickupWarehouse?.id || "");
    setPaymentMethods(config.paymentMethods || []);
    setInstructions(config.bankTransferInstructions || "");
  }, [query.data]);

  if (query.isLoading) return <LoadingState />;
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
  const save = async () => {
    try {
      await update.mutateAsync({
        enabled,
        deliveryWarehouseIds,
        pickupWarehouseId: pickupWarehouseId || null,
        paymentMethods,
        bankTransferInstructions: instructions || null,
      });
      await query.refetch();
      Alert.alert(
        uiCopy("Saved"),
        uiCopy("Public sales settings were updated."),
      );
    } catch (error) {
      Alert.alert(
        uiCopy("Unable to save"),
        error instanceof Error
          ? error.message
          : uiCopy("Review the configuration."),
      );
    }
  };
  return (
    <Screen title={uiCopy("Public sales")} scroll>
      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={type.title}>{uiCopy("Accept public orders")}</Text>
            <Text style={styles.muted}>
              {uiCopy("Catalog visibility remains a separate setting.")}
            </Text>
          </View>
          <Switch value={enabled} onValueChange={setEnabled} />
        </View>
      </Card>
      <Card>
        <Text style={type.h2}>{uiCopy("Delivery warehouses")}</Text>
        {query.data?.warehouses?.map((warehouse: any) => (
          <View key={warehouse.id} style={styles.row}>
            <Text style={styles.flex}>
              {warehouse.name}
              {!warehouse.hasActiveDeliveryZone
                ? uiCopy(" · no active zone")
                : ""}
            </Text>
            <Switch
              disabled={!warehouse.hasActiveDeliveryZone}
              value={deliveryWarehouseIds.includes(warehouse.id)}
              onValueChange={() =>
                setDeliveryWarehouseIds(
                  toggle(deliveryWarehouseIds, warehouse.id),
                )
              }
            />
          </View>
        ))}
      </Card>
      <Card>
        <Text style={type.h2}>{uiCopy("Pickup warehouse")}</Text>
        {query.data?.warehouses?.map((warehouse: any) => (
          <Button
            key={warehouse.id}
            label={warehouse.name}
            variant={pickupWarehouseId === warehouse.id ? "primary" : "outline"}
            onPress={() =>
              setPickupWarehouseId(
                pickupWarehouseId === warehouse.id ? "" : warehouse.id,
              )
            }
            style={styles.button}
          />
        ))}
      </Card>
      <Card>
        <Text style={type.h2}>{uiCopy("Offline payments")}</Text>
        {METHODS.map((method) => (
          <View key={method} style={styles.row}>
            <Text style={styles.flex}>{method.replace(/_/g, " ")}</Text>
            <Switch
              value={paymentMethods.includes(method)}
              onValueChange={() =>
                setPaymentMethods(
                  toggle(paymentMethods, method) as PublicPaymentMethod[],
                )
              }
            />
          </View>
        ))}
        {paymentMethods.includes("BANK_TRANSFER") ? (
          <TextInput
            multiline
            placeholder={uiCopy("Bank transfer instructions")}
            value={instructions}
            onChangeText={setInstructions}
            style={styles.input}
          />
        ) : null}
      </Card>
      {query.data?.config?.validationErrors?.length ? (
        <Card>
          <Text style={type.h2}>{uiCopy("Configuration needed")}</Text>
          {query.data.config.validationErrors.map((message: string) => (
            <Text key={message} style={styles.muted}>
              • {message}
            </Text>
          ))}
        </Card>
      ) : null}
      <Button
        label={uiCopy("Save public sales")}
        loading={update.isPending}
        onPress={() => void save()}
      />
      {query.data?.config?.storefrontUrl ? (
        <Button
          label={uiCopy("Share storefront")}
          variant="outline"
          icon="share-outline"
          onPress={() =>
            void Share.share({
              message: query.data.config.storefrontUrl,
              url: query.data.config.storefrontUrl,
            })
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  flex: { flex: 1 },
  muted: { ...type.label, marginTop: 3 },
  button: { marginTop: theme.spacing.sm },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    color: colors.text,
    textAlignVertical: "top",
  },
});
