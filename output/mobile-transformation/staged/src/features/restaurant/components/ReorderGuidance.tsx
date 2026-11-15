import { Text, TextInput } from "../../../components/ui/primitives";
import { useAppLocale as useUiLocale } from "../../../i18n";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { useFeatureEnabled } from "../../../hooks/useEntitlements";
import { usePermissions } from "../../../hooks/usePermissions";
import { useReorderGuidance } from "../../../services/api/queries/reorder";
import { useQuickLists } from "../../../services/api/queries/quickLists";
import { api } from "../../../services/api/client";
import { useCartStore } from "../../../store/cartStore";
import type { Product } from "../../../types/supplify";
import type { ReorderAssistanceItem } from "../../../types/reorder";
import type { RestaurantStackParamList } from "../../../navigation/RestaurantNavigator";
import { Card } from "../../../components/ui";
import { colors } from "../../../theme";
import { assistantText as t } from "../../assistant/i18n";

export function ReorderGuidance() {
  useUiLocale();

  const enabled = useFeatureEnabled("smart_reorder");
  return enabled ? <GuidanceBody /> : null;
}

function GuidanceBody() {
  useUiLocale();

  const query = useReorderGuidance();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const { can } = usePermissions();
  const canOrder = can("ORDERS_CREATE");
  const listsEnabled = useFeatureEnabled("quick_lists");
  const navigation =
    useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>();
  const [busy, setBusy] = useState<string | null>(null);
  const [listItem, setListItem] = useState<ReorderAssistanceItem | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const rows = (query.data?.suggestions || []).filter(
    (item) =>
      (filter === "all" || item.action === filter) &&
      `${item.productName} ${item.supplierName || ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const visible = expanded ? rows : rows.slice(0, 5);
  async function addCart(item: ReorderAssistanceItem) {
    if (
      item.action !== "order" ||
      !item.productId ||
      !(Number(item.suggestedQty) > 0)
    )
      return;
    if (useCartStore.getState().checkoutAttempt) {
      Alert.alert(t("guidance.title"), t("pendingCheckout"));
      return;
    }
    setBusy(item.id);
    try {
      const response = await api.get<{ product: Product }>(
        `/api/products/${item.productId}`,
      );
      if (!mounted.current) return;
      const product = response.product;
      if (
        !product ||
        product.pricing_source === "QUOTE_PRICE" ||
        product.current_price == null ||
        product.available_qty == null ||
        Number(product.available_qty) < Number(item.suggestedQty)
      ) {
        Alert.alert(t("guidance.title"), t("reviewProduct"));
        return;
      }
      if (useCartStore.getState().checkoutAttempt) {
        Alert.alert(t("guidance.title"), t("pendingCheckout"));
        return;
      }
      useCartStore.getState().addItem(product, Number(item.suggestedQty));
      navigation.navigate("Cart");
    } catch {
      if (mounted.current) Alert.alert(t("guidance.title"), t("error"));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.title}>{t("guidance.title")}</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          disabled={query.isFetching}
          onPress={() => void query.refetch()}
        >
          <Text style={styles.link}>{t("guidance.refresh")}</Text>
        </Pressable>
      </View>
      <Text style={styles.meta}>{t("guidance.description")}</Text>
      <TextInput
        accessibilityLabel={t("guidance.search")}
        placeholder={t("guidance.search")}
        style={styles.input}
        value={search}
        onChangeText={setSearch}
      />
      <View style={styles.row}>
        {["all", "order", "wait", "manual_review"].map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === key }}
            style={[styles.filter, filter === key && styles.selected]}
            onPress={() => setFilter(key)}
          >
            <Text style={styles.text}>
              {t(key === "all" ? "guidance.all" : `guidance.actions.${key}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      {query.isError && (
        <Text accessibilityRole="alert" style={styles.warning}>
          {t("error")}
        </Text>
      )}
      {query.isLoading && <Text>{t("thinking")}</Text>}
      {!query.isLoading && !query.isError && !rows.length && (
        <Text style={styles.meta}>{t("guidance.empty")}</Text>
      )}
      {visible.map((item) => (
        <Card key={item.id} style={styles.card}>
          <Text style={styles.title}>{item.productName}</Text>
          <Text style={styles.meta}>{item.supplierName}</Text>
          <Text style={styles.text}>
            {t(`guidance.actions.${item.action || "manual_review"}`)} ·{" "}
            {t(`guidance.quality.${item.dataQuality || "poor"}`)}
          </Text>
          <View style={styles.metrics}>
            {(
              [
                ["onHand", item.currentQty],
                ["incoming", item.incomingQty],
                ["expectedUsage", item.expectedUsage],
                ["netNeed", item.netNeed],
              ] as const
            ).map(([key, value]) => (
              <View key={key} style={styles.metric}>
                <Text style={styles.meta}>{t(`guidance.${key}`)}</Text>
                <Text style={styles.text}>
                  {value == null
                    ? t("guidance.unknown")
                    : `${Number(value.toFixed(3))} ${item.productUnit || ""}`}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.text}>
            {t("guidance.suggested")}:{" "}
            {item.suggestedQty == null
              ? t("guidance.unknown")
              : `${item.suggestedQty} ${item.productUnit || ""}`}
          </Text>
          {!!item.stockScope && (
            <Text style={styles.meta}>
              {t(`guidance.scope.${item.stockScope}`)}
            </Text>
          )}
          {!!item.orderBy && (
            <Text style={styles.meta}>
              {t("orderBy")}: {item.orderBy}
            </Text>
          )}
          <Text style={styles.meta}>{item.reasonLabel}</Text>
          {item.warnings?.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {t(`guidance.warnings.${warning}`)}
            </Text>
          ))}
          {item.supplierId && can("CATALOG_VIEW") && (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() =>
                navigation.navigate("Catalog", {
                  supplierId: item.supplierId!,
                  supplierName: item.supplierName || "",
                })
              }
            >
              <Text style={styles.link}>{t("viewCatalog")}</Text>
            </Pressable>
          )}
          {canOrder &&
            item.action === "order" &&
            Number(item.suggestedQty) > 0 && (
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.button}
                  disabled={busy === item.id}
                  onPress={() => void addCart(item)}
                >
                  <Text style={styles.link}>{t("addCart")}</Text>
                </Pressable>
                {listsEnabled && (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.button}
                    disabled={busy === item.id}
                    onPress={() => setListItem(item)}
                  >
                    <Text style={styles.link}>{t("addList")}</Text>
                  </Pressable>
                )}
              </View>
            )}
        </Card>
      ))}
      {rows.length > 5 && (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={styles.link}>
            {t(expanded ? "showLess" : "showAll")}
          </Text>
        </Pressable>
      )}
      {!!listItem && (
        <ListChoice item={listItem} close={() => setListItem(null)} />
      )}
    </View>
  );
}

function ListChoice({
  item,
  close,
}: {
  item: ReorderAssistanceItem;
  close: () => void;
}) {
  useUiLocale();

  const query = useQuickLists();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(id: string) {
    if (
      busy ||
      item.action !== "order" ||
      !item.productId ||
      !(Number(item.suggestedQty) > 0)
    )
      return;
    setBusy(true);
    try {
      await api.post(`/api/quick-lists/${id}/items`, {
        productId: item.productId,
        supplierId: item.supplierId,
        quantity: item.suggestedQty,
      });
      void qc.invalidateQueries({ queryKey: ["quick-lists"] });
      close();
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) close();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>{t("chooseList")}</Text>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.warning}>
              {error}
            </Text>
          )}
          {query.isLoading ? (
            <Text>{t("thinking")}</Text>
          ) : (
            <ScrollView>
              {query.data?.map((list) => (
                <Pressable
                  accessibilityRole="button"
                  style={styles.button}
                  key={list.id}
                  disabled={busy}
                  onPress={() => void save(list.id)}
                >
                  <Text style={styles.text}>{list.name}</Text>
                </Pressable>
              ))}
              {!query.data?.length && (
                <Text>{query.isError ? t("error") : t("noLists")}</Text>
              )}
            </ScrollView>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.button}
            onPress={close}
          >
            <Text style={styles.link}>{t("closeAria")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text, flexShrink: 1 },
  text: { color: colors.text, fontSize: 13, lineHeight: 20 },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10 },
  link: { color: colors.brand, fontWeight: "600" },
  input: {
    minHeight: 44,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
  },
  filter: {
    minHeight: 44,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  selected: { borderColor: colors.brand, backgroundColor: colors.surface },
  card: { padding: 12, gap: 7 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "46%" },
  warning: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modal: {
    maxHeight: "70%",
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.surface,
    gap: 12,
  },
});
