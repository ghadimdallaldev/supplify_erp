import { StyleSheet, Text, View } from "react-native";
import { useActiveDeals } from "../../../services/api/queries";
import type { ActiveDeal } from "../../../types/promotions";
import {
  Card,
  EmptyState,
  ErrorState,
  FlashList,
  LoadingState,
  Screen,
} from "../../../components/ui";
import { formatDay } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";
import { activeDealDiscountLabel } from "../../../lib/dealDisplay";

export function DealsScreen() {
  const {
    data: deals,
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = useActiveDeals();

  if (isLoading) return <LoadingState />;

  if (isError)
    return (
      <Screen title="Deals" subtitle="Active promotions from suppliers">
        <ErrorState
          title="Unable to load deals"
          message="Your offers could not be loaded. Please try again."
          onRetry={() => {
            void refetch();
          }}
        />
      </Screen>
    );

  const rows = deals ?? [];

  return (
    <Screen
      title="Deals"
      subtitle="Active promotions from suppliers"
      scroll={false}
      padded={false}
    >
      <FlashList
        data={rows}
        refreshing={isRefetching}
        onRefresh={() => {
          void refetch();
        }}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            title="No active deals"
            message="Check back later for supplier promotions."
            icon="pricetag-outline"
          />
        }
        renderItem={({ item }) => <DealRow deal={item} />}
      />
    </Screen>
  );
}

function DealRow({ deal }: { deal: ActiveDeal }) {
  const discount = activeDealDiscountLabel(deal);

  return (
    <Card style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{discount}</Text>
      </View>
      <Text style={type.title}>{deal.name}</Text>
      {deal.supplier_name ? (
        <Text style={styles.meta}>{deal.supplier_name}</Text>
      ) : null}
      {deal.description ? (
        <Text style={styles.desc} numberOfLines={2}>
          {deal.description}
        </Text>
      ) : null}
      {deal.ends_at ? (
        <Text style={styles.ends}>Ends {formatDay(deal.ends_at)}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  card: { marginBottom: theme.spacing.sm },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    marginBottom: 8,
  },
  badgeText: { fontSize: 12, fontWeight: "800", color: colors.success },
  meta: { ...type.label, marginTop: 2 },
  desc: { ...type.body, color: colors.textMuted, marginTop: 6 },
  ends: { ...type.caption, marginTop: 8 },
});
