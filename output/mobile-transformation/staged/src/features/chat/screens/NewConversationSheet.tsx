import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  EmptyState,
  ErrorState,
  FlashList,
  ListRow,
  ListSkeleton,
  Sheet,
} from "../../../components/ui";
import { SearchField } from "../../../components/ui/SearchField";
import { useRestaurants, useSuppliers } from "../../../services/api/queries";
import { theme } from "../../../theme";

type Party = { id: string; name: string };

/**
 * Counterparty picker for starting a conversation. Split into two mounted-on-demand
 * variants so a restaurant never calls /api/restaurants and vice versa.
 */
function PartyPicker({
  visible,
  onClose,
  onSelect,
  parties,
  isLoading,
  isError,
  onRetry,
  title,
  placeholder,
  emptyTitle,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (party: Party) => void;
  parties: Party[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  title: string;
  placeholder: string;
  emptyTitle: string;
}) {
  useUiLocale();

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? parties.filter((p) => p.name.toLowerCase().includes(term))
      : parties;
  }, [parties, search]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder={placeholder}
      />
      <View style={styles.list}>
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : isError ? (
          <ErrorState
            message={uiCopy("Could not load the list.")}
            onRetry={onRetry}
          />
        ) : (
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <EmptyState
                icon="people-outline"
                title={emptyTitle}
                message={search ? uiCopy("Try a different search.") : undefined}
              />
            }
            renderItem={({ item }) => (
              <ListRow
                avatarLabel={item.name}
                title={item.name}
                compact
                onPress={() => onSelect(item)}
              />
            )}
          />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { height: 360, marginBottom: theme.spacing.sm },
});

export function NewSupplierConversationSheet(props: {
  visible: boolean;
  onClose: () => void;
  onSelect: (party: Party) => void;
}) {
  useUiLocale();

  const query = useSuppliers();
  const parties = (query.data?.suppliers ?? []).map((s) => ({
    id: s.id,
    name: s.name,
  }));
  return (
    <PartyPicker
      {...props}
      parties={parties}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => void query.refetch()}
      title={uiCopy("New message")}
      placeholder={uiCopy("Search suppliers")}
      emptyTitle={uiCopy("No suppliers available")}
    />
  );
}

export function NewCustomerConversationSheet(props: {
  visible: boolean;
  onClose: () => void;
  onSelect: (party: Party) => void;
}) {
  useUiLocale();

  const query = useRestaurants();
  const parties = (query.data?.restaurants ?? []).map((r) => ({
    id: r.id,
    name: r.name,
  }));
  return (
    <PartyPicker
      {...props}
      parties={parties}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => void query.refetch()}
      title={uiCopy("New message")}
      placeholder={uiCopy("Search customers")}
      emptyTitle={uiCopy("No customers available")}
    />
  );
}
