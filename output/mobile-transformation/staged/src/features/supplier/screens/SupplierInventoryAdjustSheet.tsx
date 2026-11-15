import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { Sheet as DesignSheet } from "../../../components/ui/Sheet";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useUpdateSupplierInventory } from "../../../services/api/queries/supplierInventory";
import type { SupplierInventoryItem } from "../../../types/supplierInventory";
import { useToast } from "../../shared/ToastProvider";
import { Button } from "../../../components/ui";
import { ApiError } from "../../../services/api/client";
import { colors, theme, type } from "../../../theme";

export function SupplierInventoryAdjustSheet({
  item,
  visible,
  onClose,
}: {
  item: SupplierInventoryItem | null;
  visible: boolean;
  onClose: () => void;
}) {
  useUiLocale();

  const showToast = useToast();
  const updateInventory = useUpdateSupplierInventory();
  const [quantity, setQuantity] = useState("");
  const busy = updateInventory.isPending;

  useEffect(() => {
    if (!visible || !item) return;
    setQuantity(String(item.available_qty ?? 0));
  }, [visible, item?.product_id, item?.available_qty]);

  if (!item) return null;

  const submit = async () => {
    const availableQty = Number(quantity);
    if (!Number.isFinite(availableQty) || availableQty < 0) {
      showToast("Enter a valid quantity (0 or greater).", "error");
      return;
    }

    try {
      await updateInventory.mutateAsync({
        productId: item.product_id,
        availableQty,
      });
      showToast("Stock updated.", "success");
      onClose();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "Could not update inventory.";
      showToast(message, "error");
    }
  };

  return (
    <DesignSheet visible={visible} onClose={onClose}>
      <Text style={type.h2}>{uiCopy("Set on-hand quantity")}</Text>
      <Text style={styles.productName} numberOfLines={2}>
        {item.product_name ?? item.sku ?? uiCopy("Product")}
      </Text>
      <Text style={styles.label}>{uiCopy("Available quantity")}</Text>
      <TextInput
        style={styles.input}
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        placeholder="0"
        editable={!busy}
      />
      <View style={styles.actions}>
        <Button
          label={uiCopy("Cancel")}
          variant="outline"
          onPress={onClose}
          disabled={busy}
          style={styles.btn}
        />
        <Button
          label={uiCopy("Save")}
          onPress={() => void submit()}
          loading={busy}
          style={styles.btn}
        />
      </View>
    </DesignSheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  productName: { color: colors.textMuted, fontWeight: "600" },
  label: {
    ...type.label,
    color: colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutralBorder,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  btn: { flex: 1 },
});
