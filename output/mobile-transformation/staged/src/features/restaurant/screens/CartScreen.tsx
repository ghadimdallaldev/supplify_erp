import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCartStore } from "../../../store/cartStore";
import {
  useCreateOrder,
  useDeliveryLocations,
  useResolveContractPrices,
} from "../../../services/api/queries";
import { Button, EmptyState, FlashList, Screen } from "../../../components/ui";
import {
  V2ProductRow,
  V2QuantityControl,
  V2SectionHeader,
  V2StickyCheckoutBar,
} from "../../../components/ui/v2";
import { formatMoney } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";
import {
  stepCartQuantity,
  validateCartItems,
} from "../../../lib/orderQuantityRules";
import {
  cartCurrencyError,
  cartCurrencyTotals,
  cartSupplierSummaries,
} from "../../../lib/cartCurrency";
import { ApiError } from "../../../services/api/client";
import { getRequestScopeVersion } from "../../auth/requestScope";
import {
  DELIVERY_DATE_CHIP_OPTIONS,
  DELIVERY_DATE_CUTOFF_HINT,
  deliveryDateForOffset,
} from "../../../utils/deliveryDate";

export function CartScreen() {
  useUiLocale();

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const {
    items,
    checkoutAttempt,
    beginCheckout,
    finishCheckout,
    updateQuantity,
    updateItemResolvedPrice,
    removeItem,
  } = useCartStore();
  const createOrder = useCreateOrder();
  const resolveContractPrices = useResolveContractPrices();
  const deliveryLocations = useDeliveryLocations();
  const didResolve = useRef(false);
  const mounted = useRef(true);
  const priceRequests = useRef(new Map<string, number>());
  const [deliveryDate, setDeliveryDate] = useState(
    () => checkoutAttempt?.payload.deliveryDate ?? deliveryDateForOffset(1),
  );
  const [selectedBranchId, setSelectedBranchId] = useState(
    checkoutAttempt?.payload.branchId ?? "",
  );
  const [checkoutBarHeight, setCheckoutBarHeight] = useState(190);
  const totals = cartCurrencyTotals(items);
  const suppliers = cartSupplierSummaries(items);
  const currencyError = cartCurrencyError(items);
  const submitting =
    createOrder.isPending || checkoutAttempt?.status === "submitting";
  const recovering = checkoutAttempt?.status === "uncertain";
  const editingLocked = Boolean(checkoutAttempt);
  const supplierCount = new Set(items.map((item) => item.product.supplier_id))
    .size;
  const deliveryBranches = deliveryLocations.data?.branches ?? [];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (editingLocked) return;
    if (deliveryBranches.length === 1) {
      setSelectedBranchId((current) => current || deliveryBranches[0].id);
    } else if (deliveryBranches.length > 1) {
      setSelectedBranchId((current) =>
        deliveryBranches.some((branch) => branch.id === current) ? current : "",
      );
    } else {
      setSelectedBranchId("");
    }
  }, [deliveryBranches, editingLocked]);

  const applyResolved = async (
    targets: Array<{ productId: string; supplierId: string; quantity: number }>,
  ) => {
    if (!targets.length) return;
    const requests = new Map(
      targets.map((target) => {
        const version = (priceRequests.current.get(target.productId) ?? 0) + 1;
        priceRequests.current.set(target.productId, version);
        return [target.productId, version] as const;
      }),
    );
    try {
      const result = await resolveContractPrices.mutateAsync({
        items: targets,
      });
      for (const resolved of result.items ?? []) {
        if (resolved?.unitPrice == null) continue;
        if (
          priceRequests.current.get(resolved.productId) !==
          requests.get(resolved.productId)
        )
          continue;
        updateItemResolvedPrice(
          resolved.productId,
          resolved.unitPrice,
          resolved.source as "DEFAULT_PRICE" | "CONTRACT_PRICE" | "QUOTE_PRICE",
          resolved.defaultPrice,
        );
      }
    } catch {
      // Checkout re-resolves server-side
    }
  };

  useEffect(() => {
    if (didResolve.current || !items.length) return;
    const payload = items
      .filter((item) => item.product.supplier_id && !item.quoteLock)
      .map((item) => ({
        productId: item.product.id,
        supplierId: item.product.supplier_id,
        quantity: item.quantity,
      }));
    if (!payload.length) return;
    didResolve.current = true;
    void applyResolved(payload);
  }, [items]);

  const changeQuantity = (productId: string, quantity: number) => {
    updateQuantity(productId, quantity);
    if (quantity <= 0) return;
    const item = items.find((i) => i.product.id === productId);
    if (!item?.product.supplier_id || item.quoteLock) return;
    void applyResolved([
      {
        productId,
        supplierId: item.product.supplier_id,
        quantity,
      },
    ]);
  };
  const checkout = async () => {
    if (useCartStore.getState().checkoutAttempt?.status === "submitting")
      return;
    if (!items.length) return;
    const ruleErrors = validateCartItems(items);
    if (ruleErrors.length) {
      Alert.alert(uiCopy("Check quantities"), ruleErrors[0]);
      return;
    }
    if (currencyError) {
      Alert.alert(uiCopy("Check order currencies"), currencyError);
      return;
    }
    if (deliveryBranches.length > 1 && !selectedBranchId) {
      Alert.alert(
        uiCopy("Delivery location required"),
        uiCopy("Choose a delivery location before placing the order."),
      );
      return;
    }
    const scope = getRequestScopeVersion();
    const quoteLocks = items.flatMap((item) =>
      item.quoteLock
        ? [
            {
              productId: item.product.id,
              quoteRequestSupplierId: item.quoteLock.quoteRequestSupplierId,
              quoteResponseItemId: item.quoteLock.quoteResponseItemId,
            },
          ]
        : [],
    );
    const attempt = beginCheckout({
      items: items.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        notes: item.notes,
      })),
      quoteLocks: quoteLocks.length ? quoteLocks : undefined,
      deliveryDate: deliveryDate || undefined,
      branchId: selectedBranchId || undefined,
      status: "PLACED",
    });
    try {
      const orders = await createOrder.mutateAsync({
        ...attempt.payload,
        idempotencyKey: attempt.key,
      });
      if (getRequestScopeVersion() !== scope) return;
      finishCheckout(attempt.key, "success");
      if (!mounted.current) return;
      Alert.alert(
        uiCopy("Order placed"),
        uiCopy("{{v0}} supplier order{{v1}} created.", {
          v0: Array.isArray(orders) ? orders.length : supplierCount,
          v1: supplierCount === 1 ? "" : "s",
        }),
      );
      navigation.navigate("Orders");
    } catch (error) {
      if (getRequestScopeVersion() !== scope) return;
      const rejected =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 409;
      finishCheckout(attempt.key, rejected ? "rejected" : "uncertain");
      if (!mounted.current) return;
      Alert.alert(
        rejected
          ? uiCopy("Checkout needs attention")
          : uiCopy("Order confirmation pending"),
        rejected
          ? error.message
          : uiCopy(
              "We could not confirm the result. Check your orders or retry this same checkout safely. Your cart is held until confirmation.",
            ),
      );
    }
  };

  return (
    <Screen
      title={uiCopy("Cart")}
      subtitle={
        items.length
          ? uiCopy("{{v0}} item{{v1}} · {{v2}} supplier{{v3}}", {
              v0: items.length,
              v1: items.length === 1 ? "" : "s",
              v2: supplierCount,
              v3: supplierCount === 1 ? "" : "s",
            })
          : undefined
      }
      padded={false}
    >
      <FlashList
        data={items}
        contentContainerStyle={[
          styles.list,
          items.length > 0 && {
            paddingBottom: checkoutBarHeight + theme.spacing.lg,
          },
        ]}
        keyExtractor={(item) => item.product.id}
        ListEmptyComponent={
          <EmptyState
            title={uiCopy("Cart is empty")}
            message={uiCopy("Add products from a supplier catalog.")}
            icon="cart-outline"
            actionLabel={uiCopy("Browse suppliers")}
            onAction={() => navigation.navigate("Shop")}
          />
        }
        renderItem={({ item }) => {
          const badges: Array<{
            label: string;
            tone?: "brand" | "warning" | "neutral";
          }> = [];
          if (item.quoteLock)
            badges.push({ label: uiCopy("Quote"), tone: "warning" });
          else if (item.product.pricing_source === "CONTRACT_PRICE")
            badges.push({ label: uiCopy("Contract"), tone: "brand" });
          const packBits = [
            item.product.moq && item.product.moq > 1
              ? `MOQ ${item.product.moq}`
              : null,
            item.product.order_multiple && item.product.order_multiple > 1
              ? `Pack ×${item.product.order_multiple}`
              : null,
          ].filter(Boolean);
          const strike =
            item.product.pricing_source === "CONTRACT_PRICE" &&
            item.product.catalog_price != null &&
            item.product.current_price != null &&
            Number(item.product.catalog_price) >
              Number(item.product.current_price)
              ? formatMoney(item.product.catalog_price, item.product.currency)
              : undefined;
          return (
            <V2ProductRow
              name={item.product.name}
              meta={[
                item.product.supplier_name ?? uiCopy("Supplier"),
                ...packBits,
              ]
                .filter(Boolean)
                .join(" · ")}
              price={
                item.product.current_price != null
                  ? `${formatMoney(item.product.current_price, item.product.currency)} each`
                  : undefined
              }
              strikePrice={strike}
              badges={badges}
              trailing={
                <View style={styles.lineActions}>
                  <V2QuantityControl
                    quantity={item.quantity}
                    onChangeQuantity={(quantity) =>
                      changeQuantity(item.product.id, quantity)
                    }
                    disabled={editingLocked}
                    onDecrement={() =>
                      changeQuantity(
                        item.product.id,
                        stepCartQuantity(item.quantity, -1, item.product),
                      )
                    }
                    onIncrement={() =>
                      changeQuantity(
                        item.product.id,
                        stepCartQuantity(item.quantity, 1, item.product),
                      )
                    }
                  />
                  <Pressable
                    onPress={() => removeItem(item.product.id)}
                    disabled={editingLocked}
                    hitSlop={8}
                    style={{
                      minHeight: 48,
                      minWidth: 56,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={uiCopy("Remove line")}
                  >
                    <Text style={styles.remove}>{uiCopy("Remove")}</Text>
                  </Pressable>
                </View>
              }
            />
          );
        }}
        ListFooterComponent={
          items.length ? (
            <View style={styles.footer}>
              {recovering ? (
                <View style={styles.notice} accessibilityLiveRegion="polite">
                  <Text style={styles.noticeTitle}>
                    {uiCopy("Order confirmation pending")}
                  </Text>
                  <Text style={styles.noticeText}>
                    {uiCopy(
                      "Check your order history or retry safely below. This will reuse the original checkout.",
                    )}
                  </Text>
                  <Button
                    label={uiCopy("Check my orders")}
                    variant="outline"
                    onPress={() => navigation.navigate("Orders")}
                  />
                </View>
              ) : null}
              {currencyError ? (
                <Text style={styles.errorText}>{currencyError}</Text>
              ) : null}
              <V2SectionHeader>{uiCopy("Supplier subtotals")}</V2SectionHeader>
              {suppliers.map((supplier) => (
                <View key={supplier.id} style={styles.supplierSummary}>
                  <Text style={styles.supplierName}>{supplier.name}</Text>
                  <Text style={styles.summaryAmount}>
                    {supplier.totals
                      .map((entry) =>
                        formatMoney(entry.subtotal, entry.currency),
                      )
                      .join(" + ")}
                  </Text>
                </View>
              ))}
              <Text style={styles.hint}>
                {uiCopy(
                  "Final prices and availability are checked when you place the order. Different currencies are shown separately.",
                )}
              </Text>
              {supplierCount > 1 ? (
                <Text style={styles.hint}>
                  {uiCopy(
                    "Checkout creates one order per supplier automatically.",
                  )}
                </Text>
              ) : null}
              {deliveryBranches.length > 1 ? (
                <>
                  <V2SectionHeader>
                    {uiCopy("Delivery location")}
                  </V2SectionHeader>
                  <View style={styles.chipRow}>
                    {deliveryBranches.map((branch) => {
                      const active = selectedBranchId === branch.id;
                      return (
                        <Pressable
                          key={branch.id}
                          disabled={editingLocked}
                          onPress={() => setSelectedBranchId(branch.id)}
                          style={[styles.chip, active && styles.chipActive]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              active && styles.chipTextActive,
                            ]}
                          >
                            {branch.name ??
                              branch.code ??
                              uiCopy("Delivery location")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
              <V2SectionHeader>
                {uiCopy("Preferred delivery date")}
              </V2SectionHeader>
              <View style={styles.chipRow}>
                {DELIVERY_DATE_CHIP_OPTIONS.map((option) => {
                  const value = deliveryDateForOffset(option.offset);
                  const active = deliveryDate === value;
                  return (
                    <Pressable
                      key={option.label}
                      disabled={editingLocked}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: active,
                        disabled: editingLocked,
                      }}
                      onPress={() => setDeliveryDate(value)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.cutoffHint}>{DELIVERY_DATE_CUTOFF_HINT}</Text>
              <Button
                label={uiCopy("Request supplier quotes")}
                disabled={editingLocked}
                variant="outline"
                icon="document-text-outline"
                onPress={() => navigation.navigate("CreateQuoteRequest")}
                style={styles.quoteButton}
              />
            </View>
          ) : null
        }
      />
      {items.length ? (
        <View
          onLayout={(event) =>
            setCheckoutBarHeight(Math.ceil(event.nativeEvent.layout.height))
          }
          style={[
            styles.stickyWrap,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) },
          ]}
        >
          <V2StickyCheckoutBar
            totalLabel={
              totals.length > 1
                ? uiCopy("Estimated totals by currency")
                : uiCopy("Estimated total")
            }
            total={totals
              .map((entry) => formatMoney(entry.subtotal, entry.currency))
              .join("\n")}
            actionLabel={
              submitting
                ? uiCopy("Placing…")
                : recovering
                  ? uiCopy("Retry safely")
                  : uiCopy("Place order")
            }
            onAction={() => void checkout()}
            loading={submitting}
            disabled={
              submitting ||
              deliveryLocations.isLoading ||
              Boolean(currencyError)
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
  lineActions: { alignItems: "flex-end", gap: 6 },
  supplierSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: theme.gutter,
    paddingVertical: 8,
  },
  supplierName: { ...type.label, flexShrink: 1 },
  summaryAmount: { ...type.label, color: colors.text },
  notice: {
    margin: theme.gutter,
    padding: theme.spacing.md,
    gap: 12,
    borderRadius: theme.radius.md,
    backgroundColor: colors.warningBg,
  },
  noticeTitle: { ...type.label, color: colors.text },
  noticeText: { ...type.caption, color: colors.text },
  errorText: {
    ...type.caption,
    color: colors.danger,
    paddingHorizontal: theme.gutter,
    marginBottom: 12,
  },
  remove: { fontSize: 12, fontWeight: "600", color: colors.danger },
  footer: { paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  hint: {
    ...type.label,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.sm,
  },
  chip: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: colors.surface,
    borderWidth: theme.hairline,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.onBrand },
  cutoffHint: {
    ...type.caption,
    color: colors.textMuted,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.md,
  },
  quoteButton: { marginHorizontal: theme.gutter, marginTop: theme.spacing.sm },
  stickyWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
  },
});
