import { Text } from "../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../features/auth/AuthContext";
import { BranchPickerSheet } from "../shared/BranchPickerSheet";
import { useEntitlementMap } from "../../hooks/useEntitlements";
import {
  ASSISTANT_ACCESS_PERMISSIONS,
  canViewSupplierGrowth,
  usePermissions,
} from "../../hooks/usePermissions";
import {
  Button,
  Group,
  ListRow,
  Screen,
  SectionHeader,
} from "../../components/ui";
import { LegalLinks } from "../../components/LegalLinks";
import { webAppUrl } from "../../utils/webAppUrl";
import { colors, theme, type } from "../../theme";
import { SearchField } from "../../components/ui/SearchField";
import { copy, getAppLocale, setAppLocale } from "../../i18n";
import { destPreview, type MoreDest } from "./moreDest";

export function SettingsScreen() {
  useUiLocale();

  const { user, logout } = useAuth();
  const { can, canAny } = usePermissions();
  const { isEnabled } = useEntitlementMap();
  const navigation = useNavigation<any>();
  const [branchOpen, setBranchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const displayName = user?.displayName ?? user?.email ?? "Account";
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const openDest = (item: MoreDest) => {
    if (item.webPath) {
      void Linking.openURL(webAppUrl(item.webPath));
      return;
    }
    if (item.tab) {
      navigation.navigate("Tabs", { screen: item.tab });
      return;
    }
    if (item.screen) navigation.navigate(item.screen);
  };

  const openGroup = (title: string, items: MoreDest[]) => {
    if (items.length === 1) {
      openDest(items[0]);
      return;
    }
    navigation.navigate("MoreGroup", { title, items });
  };

  const restaurantToday: MoreDest[] = [
    can("ORDERS_CREATE")
      ? { title: uiCopy("Cart"), icon: "cart-outline" as const, screen: "Cart" }
      : null,
    canAny("RECEIVING_VIEW", "RECEIVING_MANAGE") &&
    isEnabled("receiving_quality")
      ? {
          title: uiCopy("Receiving"),
          icon: "cube-outline" as const,
          screen: "ReceivingHub",
        }
      : null,
    can("INVOICES_VIEW") && isEnabled("finance_invoices")
      ? {
          title: uiCopy("Invoices"),
          icon: "cash-outline" as const,
          screen: "Invoices",
        }
      : null,
    can("RESERVATIONS_VIEW")
      ? {
          title: uiCopy("Reservations"),
          icon: "calendar-outline" as const,
          screen: "Reservations",
        }
      : null,
    {
      title: uiCopy("Notifications"),
      icon: "notifications-outline" as const,
      screen: "Notifications",
    },
  ].filter(Boolean) as MoreDest[];

  const restaurantOrdering: MoreDest[] = [
    can("ORDERS_VIEW") && isEnabled("quick_lists")
      ? {
          title: uiCopy("Quick lists"),
          icon: "flash-outline" as const,
          screen: "QuickLists",
        }
      : null,
    can("ORDERS_VIEW") && isEnabled("disputes_returns")
      ? {
          title: uiCopy("Disputes"),
          icon: "shield-outline" as const,
          screen: "Disputes",
        }
      : null,
    canAny("CATALOG_VIEW", "ORDERS_VIEW", "ORDERS_CREATE")
      ? {
          title: uiCopy("Quote requests"),
          icon: "document-text-outline" as const,
          screen: "QuoteRequests",
        }
      : null,
    canAny("CATALOG_VIEW", "ORDERS_VIEW")
      ? {
          title: uiCopy("My prices"),
          icon: "pricetag-outline" as const,
          screen: "MyPrices",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const restaurantFinance: MoreDest[] = [
    can("INVOICES_VIEW") && isEnabled("finance_invoices")
      ? {
          title: uiCopy("Statement"),
          icon: "reader-outline" as const,
          screen: "InvoiceStatement",
        }
      : null,
    can("INVENTORY_VIEW") && isEnabled("inventory_management")
      ? {
          title: uiCopy("Inventory"),
          icon: "layers-outline" as const,
          screen: "Inventory",
        }
      : null,
    can("PROMOTIONS_VIEW") && isEnabled("supplier_deals")
      ? {
          title: uiCopy("Deals"),
          icon: "pricetag-outline" as const,
          screen: "Deals",
        }
      : null,
    isEnabled("reports") && canAny("ORDERS_VIEW", "INVOICES_VIEW")
      ? {
          title: uiCopy("Reports"),
          icon: "analytics-outline" as const,
          screen: "Reports",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const restaurantGuest: MoreDest[] = [
    can("CATALOG_VIEW")
      ? {
          title: uiCopy("Guest menu"),
          icon: "restaurant-outline" as const,
          screen: "ConsumerMenu",
        }
      : null,
    can("ORDERS_VIEW")
      ? {
          title: uiCopy("Guest orders"),
          icon: "fast-food-outline" as const,
          screen: "ConsumerOrders",
        }
      : null,
    can("CATALOG_VIEW")
      ? {
          title: uiCopy("Guest rewards"),
          icon: "gift-outline" as const,
          screen: "ConsumerLoyalty",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const restaurantRecipes: MoreDest[] =
    isEnabled("recipe_costing") && can("RECIPES_VIEW")
      ? [
          {
            title: uiCopy("Recipes"),
            icon: "restaurant-outline",
            screen: "Recipes",
          },
          {
            title: uiCopy("Recipe costing"),
            icon: "analytics-outline",
            screen: "RecipeCosting",
          },
        ]
      : [];

  const restaurantPeople: MoreDest[] = can("STAFF_VIEW")
    ? [{ title: uiCopy("Staff"), icon: "people-outline", screen: "Staff" }]
    : [];

  const restaurantWeb: MoreDest[] = [
    can("STAFF_VIEW")
      ? {
          title: uiCopy("Schedule on web"),
          icon: "open-outline" as const,
          webPath: "/app/staff",
        }
      : null,
    can("SETTINGS_VIEW")
      ? {
          title: uiCopy("Organization"),
          icon: "open-outline" as const,
          webPath: "/app/org",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const restaurantAccount: MoreDest[] = [
    {
      title: uiCopy("Notification settings"),
      icon: "options-outline",
      screen: "NotificationPreferences",
    },
    isEnabled("ai_assistant") && canAny(...ASSISTANT_ACCESS_PERMISSIONS)
      ? {
          title: uiCopy("Assistant"),
          icon: "flash-outline" as const,
          screen: "Assistant",
        }
      : null,
    {
      title: uiCopy("Plan & features"),
      icon: "card-outline",
      screen: "Subscription",
    },
  ].filter(Boolean) as MoreDest[];

  const canManageLocations = canAny(
    "SETTINGS_VIEW",
    "SETTINGS_EDIT",
    "SETTINGS_MANAGE",
  );
  /** Account/workspace switch is available for both restaurant and supplier multi-account users. */
  const showWorkspaceSwitcher =
    user?.role === "RESTAURANT" || user?.role === "SUPPLIER";

  const supplierToday: MoreDest[] = [
    can("ORDERS_VIEW")
      ? {
          title: uiCopy("Customers"),
          icon: "people-outline" as const,
          screen: "Customers",
        }
      : null,
    can("INVOICES_VIEW") && isEnabled("finance_invoices")
      ? {
          title: uiCopy("Receivables"),
          icon: "cash-outline" as const,
          screen: "Receivables",
        }
      : null,
    {
      title: uiCopy("Notifications"),
      icon: "notifications-outline",
      screen: "Notifications",
    },
  ].filter(Boolean) as MoreDest[];

  const supplierFulfillment: MoreDest[] = [
    can("FULFILLMENT_VIEW") && isEnabled("fulfillment_tools")
      ? {
          title: uiCopy("Active deliveries map"),
          icon: "map-outline" as const,
          screen: "ActiveMap",
        }
      : null,
    canAny("ORDERS_MANAGE", "FULFILLMENT_VIEW", "INVOICES_VIEW")
      ? {
          title: uiCopy("Run sheet"),
          icon: "document-text-outline" as const,
          screen: "RunSheet",
        }
      : null,
    can("FULFILLMENT_VIEW") && isEnabled("fulfillment_tools")
      ? {
          title: uiCopy("Pick lists"),
          icon: "list-outline" as const,
          screen: "PickLists",
        }
      : null,
    can("FULFILLMENT_VIEW") && isEnabled("disputes_returns")
      ? {
          title: uiCopy("Incoming disputes"),
          icon: "alert-circle-outline" as const,
          screen: "IncomingDisputes",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const supplierCatalog: MoreDest[] = [
    canAny("CATALOG_VIEW", "CATALOG_EDIT")
      ? {
          title: uiCopy("Product catalog"),
          icon: "cube-outline" as const,
          screen: "SupplierProducts",
        }
      : null,
    can("CATALOG_VIEW")
      ? {
          title: uiCopy("Contract pricing"),
          icon: "pricetags-outline" as const,
          screen: "ContractPricing",
        }
      : null,
    can("ORDERS_VIEW")
      ? {
          title: uiCopy("Quote inbox"),
          icon: "document-text-outline" as const,
          screen: "QuoteInbox",
        }
      : null,
    canAny("PROMOTIONS_VIEW", "PROMOTIONS_MANAGE", "CATALOG_MANAGE") &&
    isEnabled("promotions")
      ? {
          title: uiCopy("Deals & boosts"),
          icon: "pricetag-outline" as const,
          screen: "Promotions",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const supplierInventory: MoreDest[] = [
    can("INVENTORY_VIEW") && isEnabled("inventory_management")
      ? {
          title: uiCopy("Inventory"),
          icon: "layers-outline" as const,
          screen: "SupplierInventory",
        }
      : null,
    isEnabled("warehouses") && can("WAREHOUSES_VIEW")
      ? {
          title: uiCopy("Warehouses"),
          icon: "business-outline" as const,
          screen: "SupplierWarehouses",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const supplierGrowth: MoreDest[] = [
    can("CATALOG_VIEW")
      ? {
          title: uiCopy("Loyalty program"),
          icon: "gift-outline" as const,
          screen: "SupplierLoyalty",
        }
      : null,
    isEnabled("supplier_growth") && canViewSupplierGrowth(user, can)
      ? {
          title: uiCopy("Customer growth"),
          icon: "people-circle-outline" as const,
          screen: "CustomerGrowth",
        }
      : null,
    isEnabled("reports") &&
    canAny("FULFILLMENT_VIEW", "INVOICES_VIEW", "CATALOG_EDIT")
      ? {
          title: uiCopy("Reports"),
          icon: "analytics-outline" as const,
          screen: "Reports",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const supplierTeam: MoreDest[] = [
    isEnabled("driver_management") && can("FULFILLMENT_VIEW")
      ? {
          title: uiCopy("Drivers"),
          icon: "car-outline" as const,
          screen: "SupplierDrivers",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const supplierWeb: MoreDest[] = [
    can("SETTINGS_VIEW")
      ? {
          title: uiCopy("Zones & rules on web"),
          icon: "open-outline" as const,
          webPath: "/app/supplier-settings?tab=delivery",
        }
      : null,
    can("STAFF_VIEW")
      ? {
          title: uiCopy("Team & invites"),
          icon: "open-outline" as const,
          webPath: "/app/supplier-settings?tab=team",
        }
      : null,
    canAny("CATALOG_EDIT", "CATALOG_MANAGE")
      ? {
          title: uiCopy("Bulk import"),
          icon: "open-outline" as const,
          webPath: "/app/products",
        }
      : null,
  ].filter(Boolean) as MoreDest[];

  const supplierAccount: MoreDest[] = [
    can("SETTINGS_VIEW")
      ? {
          title: uiCopy("Public sales"),
          icon: "storefront-outline" as const,
          screen: "PublicSales",
        }
      : null,
    {
      title: uiCopy("Notification settings"),
      icon: "options-outline",
      screen: "NotificationPreferences",
    },
    isEnabled("ai_assistant") && canAny(...ASSISTANT_ACCESS_PERMISSIONS)
      ? {
          title: uiCopy("Assistant"),
          icon: "flash-outline" as const,
          screen: "Assistant",
        }
      : null,
    {
      title: uiCopy("Plan & features"),
      icon: "card-outline",
      screen: "Subscription",
    },
  ].filter(Boolean) as MoreDest[];

  const restaurantTools: { title: string; items: MoreDest[] }[] = [
    { title: uiCopy("Ordering & sourcing"), items: restaurantOrdering },
    { title: uiCopy("Finance & stock"), items: restaurantFinance },
    { title: uiCopy("Guest ordering"), items: restaurantGuest },
    { title: uiCopy("Recipes & costing"), items: restaurantRecipes },
    { title: uiCopy("People"), items: restaurantPeople },
    { title: uiCopy("Account & settings"), items: restaurantAccount },
    { title: uiCopy("Also on web"), items: restaurantWeb },
  ].filter((group) => group.items.length > 0);

  const supplierTools: { title: string; items: MoreDest[] }[] = [
    { title: uiCopy("Fulfillment"), items: supplierFulfillment },
    { title: uiCopy("Catalog & pricing"), items: supplierCatalog },
    { title: uiCopy("Inventory"), items: supplierInventory },
    { title: uiCopy("Growth"), items: supplierGrowth },
    { title: uiCopy("Team"), items: supplierTeam },
    { title: uiCopy("Account & settings"), items: supplierAccount },
    { title: uiCopy("Also on web"), items: supplierWeb },
  ].filter((group) => group.items.length > 0);

  const today = user?.role === "SUPPLIER" ? supplierToday : restaurantToday;
  const tools = user?.role === "SUPPLIER" ? supplierTools : restaurantTools;

  return (
    <Screen title={uiCopy("More")} scroll padded={false}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || "?"}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={type.h2} numberOfLines={1}>
            {displayName}
          </Text>
          {user?.workspace?.tenantName ? (
            <Text style={type.label} numberOfLines={1}>
              {user.workspace.tenantName}
            </Text>
          ) : null}
          {user?.workspace?.roleName ? (
            <Text style={type.caption}>{user.workspace.roleName}</Text>
          ) : null}
        </View>
      </View>

      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={uiCopy("Search tools and settings")}
      />
      {search.trim() ? (
        <Group>
          {[...today, ...tools.flatMap((group) => group.items)]
            .filter((item) =>
              copy(item.title)
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
            )
            .map((item) => (
              <ListRow
                key={item.screen ?? item.webPath ?? item.tab}
                title={copy(item.title)}
                icon={item.icon}
                onPress={() => openDest(item)}
              />
            ))}
        </Group>
      ) : null}
      <ListRow
        title={uiCopy("Language")}
        subtitle={getAppLocale() === "ar" ? "العربية" : uiCopy("English")}
        icon="language-outline"
        onPress={() => setAppLocale(getAppLocale() === "ar" ? "en" : "ar")}
      />
      {!search.trim() && showWorkspaceSwitcher ? (
        <>
          <SectionHeader>{uiCopy("Workspace")}</SectionHeader>
          <Group>
            <ListRow
              compact
              icon="swap-horizontal-outline"
              title={
                user?.role === "SUPPLIER"
                  ? uiCopy("Switch account")
                  : uiCopy("Switch branch")
              }
              subtitle={
                user?.workspace?.tenantName ??
                uiCopy("Choose the account you work in")
              }
              onPress={() => setBranchOpen(true)}
            />
            {user?.role === "RESTAURANT" && canManageLocations ? (
              <ListRow
                compact
                icon="location-outline"
                title={uiCopy("Delivery location")}
                onPress={() => navigation.navigate("DeliveryLocation")}
              />
            ) : null}
          </Group>
        </>
      ) : null}

      {!search.trim() && today.length > 0 ? (
        <>
          <SectionHeader>{uiCopy("Today")}</SectionHeader>
          <Group>
            {today.map((item) => (
              <ListRow
                key={item.title}
                icon={item.icon}
                title={copy(item.title)}
                compact
                onPress={() => openDest(item)}
              />
            ))}
          </Group>
        </>
      ) : null}

      {!search.trim() && tools.length > 0 ? (
        <>
          <SectionHeader>{uiCopy("Tools")}</SectionHeader>
          <Group>
            {tools.map((group) => (
              <ListRow
                key={group.title}
                title={copy(group.title)}
                note={destPreview(group.items)}
                compact
                onPress={() => openGroup(group.title, group.items)}
              />
            ))}
          </Group>
        </>
      ) : null}

      <View style={styles.signOut}>
        <Button
          label={uiCopy("Delete account")}
          variant="danger"
          icon="trash-outline"
          onPress={() => navigation.navigate("DeleteAccount")}
        />
        <Button
          label={uiCopy("Sign out")}
          variant="outline"
          icon="log-out-outline"
          onPress={() => void logout()}
        />
        <Text style={styles.version}>
          {uiCopy("Supplify Mobile · v")}{" "}
          {Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
        <LegalLinks compact />
      </View>
      <BranchPickerSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.gutter,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.neutralBg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.textMuted, fontSize: 17, fontWeight: "700" },
  signOut: { padding: theme.gutter, gap: theme.spacing.md },
  version: {
    textAlign: "center",
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: "500",
  },
});
