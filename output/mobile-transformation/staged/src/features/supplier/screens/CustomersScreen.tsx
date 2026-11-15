import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { SupplierStackParamList } from "../../../navigation/SupplierNavigator";
import {
  useOpenChatConversation,
  useRestaurants,
} from "../../../services/api/queries";
import { usePermissions } from "../../../hooks/usePermissions";
import { useEntitlementMap } from "../../../hooks/useEntitlements";
import {
  EmptyState,
  FlashList,
  IconButton,
  ListRow,
  ListSkeleton,
  Screen,
} from "../../../components/ui";
import { SearchField } from "../../../components/ui/SearchField";
import { theme } from "../../../theme";

export function CustomersScreen() {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<SupplierStackParamList>>();
  const { can } = usePermissions();
  const { isEnabled, isLoading: entitlementsLoading } = useEntitlementMap();
  const { data, isLoading } = useRestaurants();
  const openConversation = useOpenChatConversation();
  const canChat =
    can("CHAT_VIEW") &&
    can("CHAT_SEND") &&
    !entitlementsLoading &&
    isEnabled("chat");
  const [search, setSearch] = useState("");

  const restaurants = data?.restaurants ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? restaurants.filter(
          (r) =>
            r.name.toLowerCase().includes(term) ||
            r.slug?.toLowerCase().includes(term),
        )
      : restaurants;
  }, [restaurants, search]);
  const messageRestaurant = async (
    restaurant: (typeof restaurants)[number],
  ) => {
    try {
      const conversation = await openConversation.mutateAsync({
        restaurantId: restaurant.id,
      });
      navigation.navigate("ChatThread", {
        conversationId: conversation.id,
        title: restaurant.name,
      });
    } catch (error) {
      Alert.alert(
        uiCopy("Could not open chat"),
        error instanceof Error ? error.message : uiCopy("Try again."),
      );
    }
  };

  return (
    <Screen
      title={uiCopy("Customers")}
      subtitle={uiCopy("{{v0}} restaurant{{v1}}", {
        v0: filtered.length,
        v1: filtered.length !== 1 ? "s" : "",
      })}
      padded={false}
    >
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={uiCopy("Search customers")}
      />
      {isLoading && !data ? (
        <ListSkeleton rows={8} />
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="storefront-outline"
              title={
                search
                  ? uiCopy("No matching customers")
                  : uiCopy("No customers yet")
              }
              message={
                search
                  ? uiCopy("Try a different search.")
                  : uiCopy(
                      "Restaurants that follow you or previously ordered will appear here.",
                    )
              }
            />
          }
          renderItem={({ item }) => (
            <ListRow
              avatarLabel={item.name}
              title={item.name}
              subtitle={item.slug ?? undefined}
              showChevron={false}
              right={
                canChat ? (
                  <IconButton
                    icon="chatbubble-outline"
                    label={uiCopy("Message {{v0}}", { v0: item.name })}
                    onPress={() => void messageRestaurant(item)}
                    tone="brand"
                  />
                ) : undefined
              }
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
});
