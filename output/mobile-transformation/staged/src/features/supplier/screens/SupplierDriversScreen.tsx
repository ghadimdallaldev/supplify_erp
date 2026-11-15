import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { RefreshControl, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSupplierDrivers } from "../../../services/api/queries/drivers";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  driverLinkedUserHint,
  driverStatusLabel,
  type SupplierDriver,
} from "../../../types/supplierSettings";
import {
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  SectionHeader,
  StatusPill,
} from "../../../components/ui";
import { OpenOnWebRow } from "../../shared/OpenOnWebRow";
import { colors, theme, type } from "../../../theme";

export function SupplierDriversScreen() {
  useUiLocale();

  const { can } = usePermissions();
  const canManageOnWeb = can("FULFILLMENT_MANAGE");
  const query = useSupplierDrivers();
  const drivers = query.data?.drivers ?? [];

  if (query.isLoading) return <LoadingState />;

  return (
    <Screen
      title={uiCopy("Drivers")}
      subtitle={uiCopy("{{v0}} driver{{v1}}", {
        v0: drivers.length,
        v1: drivers.length === 1 ? "" : "s",
      })}
      scroll={false}
      padded={false}
    >
      <FlashList
        data={drivers}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ListHeaderComponent={
          <SectionHeader style={styles.section}>
            {uiCopy("Delivery team")}
          </SectionHeader>
        }
        ListEmptyComponent={
          <EmptyState
            icon="car-outline"
            title={uiCopy("No drivers yet")}
            message={
              canManageOnWeb
                ? uiCopy("Add drivers on web, then refresh here.")
                : uiCopy("Drivers configured on web will appear here.")
            }
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>
              {uiCopy("Manage on web")}
            </SectionHeader>
            <View style={styles.footerGroup}>
              <OpenOnWebRow
                title={uiCopy("Add or edit drivers")}
                path="/app/supplier-settings?tab=drivers"
              />
            </View>
          </View>
        }
        renderItem={({ item }) => <DriverRow driver={item} />}
      />
    </Screen>
  );
}

function DriverRow({ driver }: { driver: SupplierDriver }) {
  useUiLocale();

  const initial = driver.full_name.charAt(0).toUpperCase() || "?";
  const linkedHint = driverLinkedUserHint(driver);

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={[type.title, styles.name]} numberOfLines={1}>
            {driver.full_name}
          </Text>
          {driver.phone ? (
            <Text style={styles.sub} numberOfLines={1}>
              {driver.phone}
            </Text>
          ) : (
            <Text style={styles.subMuted}>{uiCopy("No phone")}</Text>
          )}
          {linkedHint ? (
            <View style={styles.linkedRow}>
              <Ionicons
                name={driver.user_id ? "link-outline" : "person-outline"}
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.linkedText} numberOfLines={1}>
                {linkedHint}
              </Text>
            </View>
          ) : null}
          {driver.warehouse_name ? (
            <Text style={styles.warehouse} numberOfLines={1}>
              {driver.warehouse_name}
            </Text>
          ) : null}
        </View>
        <StatusPill status={driverStatusLabel(driver)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  section: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  card: { marginBottom: theme.spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrand, fontWeight: "800", fontSize: 16 },
  meta: { flex: 1, minWidth: 0 },
  name: { marginBottom: 2 },
  sub: { color: colors.textMuted, fontWeight: "500" },
  subMuted: { color: colors.textFaint, fontStyle: "italic" },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  linkedText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  warehouse: { ...type.label, marginTop: 4, color: colors.textFaint },
  footer: { marginTop: theme.spacing.md },
  footerGroup: { gap: theme.spacing.sm },
});
