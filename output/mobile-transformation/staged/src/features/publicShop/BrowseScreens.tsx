import { Text, TextInput } from "../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
} from "../../components/ui";
import { colors, theme, type } from "../../theme";
import {
  usePublicProducts,
  usePublicSupplier,
  usePublicSuppliers,
} from "./api";
import { usePublicCart } from "./store";
import { useAuth } from "../auth/AuthContext";

const money = (amount?: number | null, currency = "USD") =>
  amount == null
    ? ""
    : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
        amount,
      );

export function PublicDiscoveryScreen() {
  useUiLocale();

  const navigation = useNavigation<any>();
  const { user, register } = useAuth();
  const [search, setSearch] = useState("");
  const query = usePublicSuppliers(search);
  const isGuest = !user;
  const goSignIn = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate("Login");
      return;
    }
    navigation.navigate("Login");
  };

  const emptyTitle = query.isError
    ? "Could not load catalogs"
    : search.trim()
      ? "No matching suppliers"
      : "No public catalogs yet";
  const emptyMessage = query.isError
    ? "Check your connection and try again."
    : search.trim()
      ? "Try a different search."
      : isGuest
        ? "Suppliers must enable public sales before their catalogs appear here. Sign in if you have a restaurant or supplier account."
        : "No suppliers have enabled public sales for shoppers yet. Pull to refresh later, or contact support.";

  return (
    <Screen
      form
      title={isGuest ? uiCopy("Browse as guest") : uiCopy("Shop")}
      subtitle={
        isGuest
          ? uiCopy("Guest checkout · delivery or pickup when available")
          : uiCopy("Public supplier catalogs for your shopper account")
      }
      showBack={isGuest}
      onBack={goSignIn}
      right={
        isGuest ? (
          <Button
            label={uiCopy("Sign in")}
            variant="outline"
            onPress={goSignIn}
          />
        ) : undefined
      }
      padded={false}
    >
      {isGuest ? (
        <View style={styles.guestActions}>
          <Button
            label={uiCopy("Back to sign in")}
            variant="ghost"
            onPress={goSignIn}
          />
          <Button
            label={uiCopy("Recent guest orders")}
            variant="ghost"
            onPress={() => navigation.navigate("RecentOrders")}
          />
          <Button
            label={uiCopy("Create shopper account")}
            variant="outline"
            onPress={() => void register()}
          />
        </View>
      ) : null}
      <TextInput
        accessibilityLabel={uiCopy("Search suppliers")}
        placeholder={uiCopy("Search suppliers")}
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />
      {query.isLoading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={query.data?.suppliers || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="storefront-outline"
              title={emptyTitle}
              message={emptyMessage}
              actionLabel={query.isError ? uiCopy("Retry") : undefined}
              onAction={query.isError ? () => void query.refetch() : undefined}
            />
          }
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          renderItem={({ item }) => (
            <Card
              onPress={() =>
                navigation.navigate("Storefront", {
                  idOrSlug: item.slug || item.id,
                })
              }
            >
              <Text style={type.h2}>{item.name}</Text>
              <Text style={styles.muted}>{uiCopy("Open public catalog")}</Text>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

export function PublicStorefrontScreen() {
  useUiLocale();

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const idOrSlug = String(route.params?.idOrSlug || "");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const supplier = usePublicSupplier(idOrSlug);
  const products = usePublicProducts(idOrSlug, search, category);
  const add = usePublicCart((state) => state.add);
  const cartCount = usePublicCart((state) =>
    state.lines.reduce((sum, line) => sum + line.quantity, 0),
  );
  const categories = products.data?.categories || [];
  const salesLocation = supplier.data?.salesLocations?.[0];
  return (
    <Screen
      form
      title={supplier.data?.name || uiCopy("Supplier")}
      subtitle={
        supplier.data?.publicSalesEnabled
          ? uiCopy("Public ordering available")
          : uiCopy("Browse-only catalog")
      }
      right={
        supplier.data?.publicSalesEnabled ? (
          <Button
            label={uiCopy("Cart ({{v0}})", { v0: cartCount })}
            variant="outline"
            onPress={() => navigation.navigate("Cart")}
          />
        ) : undefined
      }
      padded={false}
    >
      <TextInput
        placeholder={uiCopy("Search products")}
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />
      {categories.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {["", ...categories].map((item) => (
            <Pressable
              key={item || "all"}
              onPress={() => setCategory(item)}
              style={[styles.chip, category === item && styles.chipActive]}
            >
              <Text
                style={
                  category === item ? styles.chipTextActive : styles.chipText
                }
              >
                {item || uiCopy("All")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {supplier.isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title={uiCopy("Catalog unavailable")}
          message={uiCopy("This supplier storefront could not be loaded.")}
          actionLabel={uiCopy("Retry")}
          onAction={() => void supplier.refetch()}
        />
      ) : products.isLoading || supplier.isLoading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={products.data?.products || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={uiCopy("No products found")}
              message={uiCopy("Try another filter.")}
            />
          }
          renderItem={({ item }) => (
            <Card>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={type.title}>{item.name}</Text>
                  <Text style={styles.muted}>
                    {item.sku}
                    {item.unit ? ` · ${item.unit}` : ""}
                  </Text>
                  {supplier.data?.publicSalesEnabled &&
                  item.currentPrice != null ? (
                    <Text style={styles.price}>
                      {money(item.currentPrice, item.currency)}
                    </Text>
                  ) : (
                    <Text style={styles.muted}>
                      {uiCopy("Pricing not available for public ordering")}
                    </Text>
                  )}
                  {item.moq && item.moq > 1 ? (
                    <Text style={styles.rule}>
                      {uiCopy("Minimum")} {item.moq}
                      {item.orderMultiple && item.orderMultiple > 1
                        ? uiCopy(" · multiples of {{v0}}", {
                            v0: item.orderMultiple,
                          })
                        : ""}
                    </Text>
                  ) : null}
                </View>
                {supplier.data?.publicSalesEnabled && item.orderable ? (
                  <Button
                    label={uiCopy("Add")}
                    disabled={item.inStock === false || !salesLocation}
                    onPress={() => {
                      const ok = add(idOrSlug, item);
                      if (!ok) {
                        Alert.alert(
                          uiCopy("Different fulfillment location"),
                          uiCopy(
                            "Clear your current public cart before adding products from another supplier location.",
                          ),
                        );
                      }
                    }}
                  />
                ) : null}
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

export function PublicCartScreen() {
  useUiLocale();

  const navigation = useNavigation<any>();
  const lines = usePublicCart((state) => state.lines);
  const setQuantity = usePublicCart((state) => state.setQuantity);
  const clear = usePublicCart((state) => state.clear);
  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) => sum + (line.product.currentPrice || 0) * line.quantity,
        0,
      ),
    [lines],
  );
  return (
    <Screen
      form
      title={uiCopy("Cart")}
      subtitle={
        lines.length
          ? uiCopy("{{v0}} product(s)", { v0: lines.length })
          : undefined
      }
      scroll
    >
      {!lines.length ? (
        <EmptyState
          icon="cart-outline"
          title={uiCopy("Your cart is empty")}
          message={uiCopy("Add products from a public supplier catalog.")}
        />
      ) : (
        lines.map((line) => (
          <Card key={line.product.id}>
            <Text style={type.title}>{line.product.name}</Text>
            <Text style={styles.muted}>
              {money(line.product.currentPrice, line.product.currency)}{" "}
              {uiCopy("each")}
            </Text>
            <View style={styles.quantity}>
              <Button
                label="−"
                variant="outline"
                onPress={() =>
                  setQuantity(
                    line.product.id,
                    line.quantity - (line.product.orderMultiple || 1),
                  )
                }
              />
              <Text style={styles.quantityText}>{line.quantity}</Text>
              <Button
                label="+"
                variant="outline"
                onPress={() =>
                  setQuantity(
                    line.product.id,
                    line.quantity + (line.product.orderMultiple || 1),
                  )
                }
              />
            </View>
          </Card>
        ))
      )}
      {lines.length ? (
        <View style={styles.actions}>
          <Text style={styles.total}>
            {uiCopy("Estimated subtotal")}{" "}
            {money(subtotal, lines[0]?.product.currency)}
          </Text>
          <Button
            label={uiCopy("Continue to checkout")}
            onPress={() => navigation.navigate("Checkout")}
          />
          <Button
            label={uiCopy("Clear cart")}
            variant="ghost"
            onPress={clear}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    margin: theme.spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    minHeight: 46,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  list: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  chips: {
    paddingHorizontal: theme.spacing.md,
    gap: 8,
    paddingBottom: theme.spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.textMuted, fontWeight: "600" },
  chipTextActive: { color: colors.onBrand, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
  flex: { flex: 1 },
  muted: { ...type.label, marginTop: 3 },
  price: { fontSize: 17, fontWeight: "800", color: colors.text, marginTop: 8 },
  rule: { ...type.caption, marginTop: 4 },
  guestActions: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.gutter,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  quantity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  quantityText: {
    minWidth: 32,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  total: { fontSize: 18, fontWeight: "800", color: colors.text },
});
