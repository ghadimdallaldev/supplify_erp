import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useMemo, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useRecipes } from "../../../services/api/queries";
import type { Recipe } from "../../../types/recipes";
import { recipeCalcStatusLabel } from "../../../types/recipes";
import { usePermissions } from "../../../hooks/usePermissions";
import { OpenOnWebRow } from "../../shared/OpenOnWebRow";
import {
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  SectionHeader,
  StatusPill,
} from "../../../components/ui";
import { SearchField } from "../../../components/ui/SearchField";
import { formatMoney } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";

export function RecipesScreen() {
  useUiLocale();

  const { can } = usePermissions();
  const canViewCosts = can("RECIPES_VIEW_COSTS");
  const [search, setSearch] = useState("");

  const query = useRecipes({
    active: "true",
    search: search.trim() || undefined,
    limit: 100,
  });

  const recipes = query.data?.recipes ?? [];
  const total = query.data?.total ?? recipes.length;

  const subtitle = useMemo(() => {
    if (query.isLoading) return "Loading recipes…";
    return `${total} recipe${total === 1 ? "" : "s"}`;
  }, [query.isLoading, total]);

  if (query.isLoading && !query.data) return <LoadingState />;

  return (
    <Screen
      title={uiCopy("Recipes")}
      subtitle={subtitle}
      scroll={false}
      padded={false}
    >
      <View style={styles.searchWrap}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={uiCopy("Search recipes")}
        />
      </View>
      <FlashList
        data={recipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerActions}>
            <SectionHeader style={styles.section}>
              {uiCopy("Active recipes")}
            </SectionHeader>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={uiCopy("No recipes yet")}
            message={uiCopy("Recipes created on web will appear here.")}
            icon="restaurant-outline"
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>
              {uiCopy("Manage on web")}
            </SectionHeader>
            <View style={styles.footerGroup}>
              <OpenOnWebRow
                title={uiCopy("Create or edit recipes")}
                path="/app/recipes"
              />
              <OpenOnWebRow
                title={uiCopy("Recipe costing dashboard")}
                path="/app/recipe-costing"
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <RecipeRow item={item} showCost={canViewCosts} />
        )}
      />
    </Screen>
  );
}

function RecipeRow({ item, showCost }: { item: Recipe; showCost: boolean }) {
  useUiLocale();

  const currency = item.currency ?? "USD";
  const costLabel =
    showCost && item.costPerPortion != null
      ? formatMoney(item.costPerPortion, currency)
      : showCost
        ? "Cost pending"
        : null;

  return (
    <Card style={styles.card}>
      <View style={styles.rowTop}>
        <Text style={[type.title, styles.titleFlex]} numberOfLines={2}>
          {item.name}
        </Text>
        <StatusPill status={recipeCalcStatusLabel(item.calcStatus)} />
      </View>
      {item.category ? <Text style={styles.meta}>{item.category}</Text> : null}
      <View style={styles.metrics}>
        {costLabel ? (
          <Text style={styles.cost}>
            {costLabel}
            {item.portionCount && item.portionCount > 1
              ? uiCopy(" / portion")
              : ""}
          </Text>
        ) : null}
        {showCost && item.foodCostPct != null ? (
          <Text style={styles.meta}>
            {uiCopy("Food cost")} {item.foodCostPct.toFixed(1)}%
          </Text>
        ) : null}
        {item.sellingPrice != null ? (
          <Text style={styles.meta}>
            {uiCopy("Menu")} {formatMoney(item.sellingPrice, currency)}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  headerActions: { marginBottom: theme.spacing.xs },
  section: { marginTop: theme.spacing.xs },
  card: { marginBottom: theme.spacing.sm },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  titleFlex: { flex: 1 },
  meta: { ...type.label, marginTop: 4, color: colors.textMuted },
  metrics: { marginTop: 6, gap: 2 },
  cost: { ...type.title, fontSize: 15, color: colors.brandDark },
  footer: { marginTop: theme.spacing.md },
  footerGroup: { gap: theme.spacing.sm },
});
