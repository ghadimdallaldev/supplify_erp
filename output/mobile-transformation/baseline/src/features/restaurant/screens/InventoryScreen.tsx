import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useExpirySummary,
  useRestaurantInventory,
} from "../../../services/api/queries";
import type { RestaurantInventoryItem } from "../../../types/inventory";
import { inventoryParLevel, inventoryQuantity } from "../../../types/inventory";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  SectionHeader,
  StatCard,
} from "../../../components/ui";
import { colors, theme, type } from "../../../theme";
import { InventoryAdjustSheet } from "./InventoryAdjustSheet";
import { ReorderGuidance } from "../components/ReorderGuidance";

export function InventoryScreen() {
  const { canAny } = usePermissions();
  const canEdit = canAny("INVENTORY_EDIT", "INVENTORY_MANAGE");
  const { data: items, isLoading: itemsLoading } = useRestaurantInventory();
  const { data: expiry, isLoading: expiryLoading } = useExpirySummary();
  const [selectedItem, setSelectedItem] =
    useState<RestaurantInventoryItem | null>(null);

  const openAdjust = useCallback(
    (item: RestaurantInventoryItem) => {
      if (!canEdit) return;
      setSelectedItem(item);
    },
    [canEdit],
  );

  const closeAdjust = useCallback(() => setSelectedItem(null), []);

  if (itemsLoading || expiryLoading) return <LoadingState />;

  const rows = items ?? [];

  return (
    <Screen
      title="Inventory"
      subtitle={
        canEdit ? "Tap an item to adjust stock" : "On-hand stock & expiry"
      }
      scroll={false}
      padded={false}
    >
      <View style={styles.statsWrap}>
        <View style={styles.statsRow}>
          <StatCard
            value={expiry?.expiringSoon ?? 0}
            label="Expiring soon"
            icon="time-outline"
            tone="warning"
          />
          <StatCard
            value={expiry?.expired ?? 0}
            label="Expired"
            icon="alert-circle-outline"
            tone="danger"
          />
        </View>
        <StatCard
          value={expiry?.totalLots ?? rows.length}
          label="Tracked lots"
          icon="layers-outline"
          tone="info"
          style={styles.fullStat}
        />
      </View>
      <FlashList
        data={rows}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id || item.product_id}
        ListHeaderComponent={
          <>
            <ReorderGuidance />
            <SectionHeader style={styles.section}>Items</SectionHeader>
          </>
        }
        ListEmptyComponent={
          <EmptyState
            title="No inventory"
            message="Received stock will appear here."
            icon="cube-outline"
          />
        }
        renderItem={({ item }) => (
          <InventoryRow
            item={item}
            editable={canEdit}
            onPress={() => openAdjust(item)}
          />
        )}
      />
      <InventoryAdjustSheet
        item={selectedItem}
        visible={selectedItem != null}
        onClose={closeAdjust}
      />
    </Screen>
  );
}

function InventoryRow({
  item,
  editable,
  onPress,
}: {
  item: RestaurantInventoryItem;
  editable: boolean;
  onPress: () => void;
}) {
  const qty = inventoryQuantity(item);
  const par = inventoryParLevel(item);
  const low = par != null && qty <= par;

  return (
    <Card style={styles.card} onPress={editable ? onPress : undefined}>
      <View style={styles.rowTop}>
        <Text style={[type.title, styles.titleFlex]} numberOfLines={1}>
          {item.product_name ?? item.sku ?? "Item"}
        </Text>
        {low ? (
          <View style={styles.lowBadge}>
            <Text style={styles.lowText}>Low stock</Text>
          </View>
        ) : null}
        {editable ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        ) : null}
      </View>
      <Text style={styles.meta}>
        {qty}
        {item.unit ? ` ${item.unit}` : ""} on hand
        {par != null ? ` · Par ${par}` : ""}
      </Text>
      {item.category ? (
        <Text style={styles.category}>{item.category}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  statsWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  statsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  fullStat: { marginBottom: theme.spacing.sm },
  section: { marginTop: theme.spacing.xs },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  card: { marginBottom: theme.spacing.sm },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  titleFlex: { flex: 1 },
  meta: { ...type.label, marginTop: 4 },
  category: { ...type.caption, marginTop: 4 },
  lowBadge: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  lowText: { fontSize: 11, fontWeight: "700", color: colors.warning },
});
