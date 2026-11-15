import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RestaurantStackParamList } from "../../../navigation/RestaurantNavigator";
import { useQuoteRequests } from "../../../services/api/queries";
import { useCartStore } from "../../../store/cartStore";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  Button,
  EmptyState,
  FlashList,
  ListRow,
  LoadingState,
  Screen,
  StatusPill,
} from "../../../components/ui";
import { formatDay } from "../../../utils/format";
import { colors, theme } from "../../../theme";

const FILTERS = ["all", "open", "closed", "cancelled"] as const;

export function QuoteRequestsScreen() {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const { can } = usePermissions();
  const cartCount = useCartStore((state) => state.items.length);
  const query = useQuoteRequests({
    status: status === "all" ? undefined : status,
    limit: 50,
  });
  const rows = query.data?.quoteRequests ?? [];

  if (query.isLoading) return <LoadingState />;

  return (
    <Screen
      title={uiCopy("Quote requests")}
      subtitle={uiCopy("{{v0}} total", {
        v0: query.data?.pagination.total ?? rows.length,
      })}
      padded={false}
      right={
        can("ORDERS_CREATE") ? (
          <Button
            label={
              cartCount
                ? uiCopy("New ({{v0}})", { v0: cartCount })
                : uiCopy("New")
            }
            icon="add-outline"
            onPress={() => navigation.navigate("CreateQuoteRequest")}
            style={styles.newButton}
          />
        ) : undefined
      }
    >
      <View style={styles.filters}>
        {FILTERS.map((filter) => (
          <Pressable
            key={filter}
            onPress={() => setStatus(filter)}
            style={[styles.filter, status === filter && styles.filterActive]}
          >
            <Text
              style={[
                styles.filterText,
                status === filter && styles.filterTextActive,
              ]}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title={uiCopy("No quote requests")}
            message={uiCopy(
              "Add products to your cart, then request supplier pricing.",
            )}
          />
        }
        renderItem={({ item }) => (
          <ListRow
            icon="document-text-outline"
            iconTone={item.status === "open" ? "info" : "neutral"}
            title={uiCopy("{{v0}} item{{v1}}", {
              v0: item.itemCount ?? 0,
              v1: item.itemCount === 1 ? "" : "s",
            })}
            subtitle={uiCopy("{{v0}}/{{v1}} responses · {{v2}}", {
              v0: item.responseCount ?? 0,
              v1: item.supplierCount ?? 0,
              v2: formatDay(item.createdAt),
            })}
            right={<StatusPill status={item.status} />}
            onPress={() =>
              navigation.navigate("QuoteRequestDetail", {
                quoteRequestId: item.id,
              })
            }
            style={styles.row}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  newButton: { minHeight: 40, paddingHorizontal: theme.spacing.md },
  filters: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  filterActive: { backgroundColor: colors.brand },
  filterText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: colors.onBrand },
  list: {
    padding: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xxl,
  },
  row: { marginBottom: theme.spacing.sm },
});
