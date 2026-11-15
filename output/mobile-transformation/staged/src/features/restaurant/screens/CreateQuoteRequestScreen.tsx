import { DateField } from "../../../components/ui/DateField";
import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RestaurantStackParamList } from "../../../navigation/RestaurantNavigator";
import {
  useCreateQuoteRequest,
  useSuppliers,
} from "../../../services/api/queries";
import { useCartStore } from "../../../store/cartStore";
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  SectionHeader,
} from "../../../components/ui";
import { colors, theme, type } from "../../../theme";

export function CreateQuoteRequestScreen() {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>();
  const items = useCartStore((state) => state.items);
  const suppliersQuery = useSuppliers();
  const createQuote = useCreateQuoteRequest();
  const defaultSupplierIds = useMemo(
    () => [
      ...new Set(items.map((item) => item.product.supplier_id).filter(Boolean)),
    ],
    [items],
  );
  const [selectedSupplierIds, setSelectedSupplierIds] =
    useState<string[]>(defaultSupplierIds);
  const [note, setNote] = useState("");
  const [neededBy, setNeededBy] = useState("");

  if (suppliersQuery.isLoading) return <LoadingState />;

  const toggleSupplier = (supplierId: string) => {
    setSelectedSupplierIds((current) =>
      current.includes(supplierId)
        ? current.filter((id) => id !== supplierId)
        : [...current, supplierId],
    );
  };

  const submit = async () => {
    if (!items.length) return;
    if (!selectedSupplierIds.length) {
      Alert.alert(
        uiCopy("Select a supplier"),
        uiCopy("Choose at least one supplier to receive this request."),
      );
      return;
    }
    if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) {
      Alert.alert(
        uiCopy("Check the date"),
        uiCopy("Use YYYY-MM-DD for the needed-by date."),
      );
      return;
    }
    try {
      const result = await createQuote.mutateAsync({
        items: items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          unit: item.product.unit,
          notes: item.notes,
        })),
        supplierIds: selectedSupplierIds,
        note: note.trim() || undefined,
        neededBy: neededBy || undefined,
      });
      navigation.replace("QuoteRequestDetail", {
        quoteRequestId: result.quoteRequest.id,
      });
    } catch (error) {
      Alert.alert(
        uiCopy("Could not send request"),
        error instanceof Error ? error.message : uiCopy("Try again."),
      );
    }
  };

  if (!items.length) {
    return (
      <Screen form title={uiCopy("Request a quote")} scroll>
        <EmptyState
          icon="cart-outline"
          title={uiCopy("Your cart is empty")}
          message={uiCopy(
            "Add the products and quantities you need before creating a quote request.",
          )}
        />
        <Button
          label={uiCopy("Go back to shop")}
          onPress={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen
      form
      title={uiCopy("Request a quote")}
      subtitle={uiCopy("{{v0}} cart item{{v1}}", {
        v0: items.length,
        v1: items.length === 1 ? "" : "s",
      })}
      scroll
    >
      <SectionHeader>{uiCopy("Products")}</SectionHeader>
      {items.map((item) => (
        <Card key={item.product.id} elevated={false}>
          <Text style={type.title}>{item.product.name}</Text>
          <Text style={styles.meta}>
            {item.quantity} {item.product.unit ?? uiCopy("unit(s)")}
          </Text>
        </Card>
      ))}

      <SectionHeader>{uiCopy("Send to suppliers")}</SectionHeader>
      {(suppliersQuery.data?.suppliers ?? []).map((supplier) => {
        const selected = selectedSupplierIds.includes(supplier.id);
        return (
          <Pressable
            key={supplier.id}
            onPress={() => toggleSupplier(supplier.id)}
            style={[styles.supplier, selected && styles.supplierSelected]}
          >
            <View
              style={[styles.checkbox, selected && styles.checkboxSelected]}
            >
              <Text style={styles.check}>{selected ? "✓" : ""}</Text>
            </View>
            <Text style={styles.supplierName}>{supplier.name}</Text>
          </Pressable>
        );
      })}

      <SectionHeader>{uiCopy("Timing and notes")}</SectionHeader>
      <DateField value={neededBy} onChange={setNeededBy} />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={uiCopy("Message for suppliers (optional)")}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, styles.notes]}
        multiline
      />
      <Button
        label={
          createQuote.isPending
            ? uiCopy("Sending…")
            : uiCopy("Send quote request")
        }
        icon="send-outline"
        onPress={() => void submit()}
        loading={createQuote.isPending}
        disabled={createQuote.isPending}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { ...type.label, marginTop: 4 },
  supplier: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface,
  },
  supplierSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandLight,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 7,
  },
  checkboxSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  check: { color: colors.onBrand, fontWeight: "900" },
  supplierName: { ...type.title, flex: 1 },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  notes: { minHeight: 92, paddingTop: 14, textAlignVertical: "top" },
});
