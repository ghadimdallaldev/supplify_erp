import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useRecipeAlerts, useRecipeCostingDashboard } from '../../../services/api/queries'
import type { RecipeAlert } from '../../../types/recipes'
import { recipeAlertMessage } from '../../../types/recipes'
import { usePermissions } from '../../../hooks/usePermissions'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import { OpenOnWebRow } from '../../shared/OpenOnWebRow'
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  SectionHeader,
  StatCard,
} from '../../../components/ui'
import { formatMoney } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'

export function RecipeCostingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const { can } = usePermissions()
  const canViewCosts = can('RECIPES_VIEW_COSTS')

  const dashboardQuery = useRecipeCostingDashboard()
  const alertsQuery = useRecipeAlerts()

  const dashboard = dashboardQuery.data
  const alerts = alertsQuery.data ?? []
  const loading = dashboardQuery.isLoading || alertsQuery.isLoading
  const refreshing = dashboardQuery.isRefetching || alertsQuery.isRefetching

  const refresh = () => {
    void dashboardQuery.refetch()
    void alertsQuery.refetch()
  }

  if (loading && !dashboard) return <LoadingState />

  if (dashboardQuery.isError) {
    return (
      <Screen title="Recipe costing">
        <EmptyState
          title="Could not load dashboard"
          message="Check your connection and try again."
          icon="alert-circle-outline"
        />
        <Button label="Retry" variant="outline" onPress={refresh} />
      </Screen>
    )
  }

  const stats = dashboard?.stats

  return (
    <Screen title="Recipe costing" subtitle="Food cost overview" scroll={false} padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        {stats ? (
          <>
            <View style={styles.statsRow}>
              <StatCard
                value={stats.activeRecipes}
                label="Active recipes"
                icon="restaurant-outline"
                tone="brand"
              />
              <StatCard
                value={stats.aboveTargetFoodCost}
                label="Above target"
                icon="alert-circle-outline"
                tone="warning"
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard
                value={stats.missingCostData}
                label="Missing cost"
                icon="help-circle-outline"
                tone="danger"
              />
              <StatCard
                value={stats.recentlyImpacted}
                label="Recently impacted"
                icon="trending-up-outline"
                tone="info"
              />
            </View>
            {canViewCosts && stats.averageFoodCostPct != null ? (
              <Card style={styles.avgCard}>
                <Text style={type.caption}>Portfolio food cost</Text>
                <Text style={styles.avgValue}>{stats.averageFoodCostPct.toFixed(1)}%</Text>
                <Text style={styles.meta}>Average across active recipes with cost data</Text>
              </Card>
            ) : null}
          </>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="View all recipes"
            icon="list-outline"
            onPress={() => navigation.navigate('Recipes')}
          />
        </View>

        {alerts.length > 0 ? (
          <>
            <SectionHeader>Active alerts</SectionHeader>
            {alerts.map((alert, index) => (
              <AlertRow key={alert.id ?? `alert-${index}`} alert={alert} />
            ))}
          </>
        ) : (
          <Card style={styles.emptyAlerts}>
            <Text style={type.title}>No active alerts</Text>
            <Text style={styles.meta}>Recipe costing alerts will appear here when attention is needed.</Text>
          </Card>
        )}

        {canViewCosts && dashboard && dashboard.highestCostRecipes.length > 0 ? (
          <>
            <SectionHeader>Highest cost recipes</SectionHeader>
            {dashboard.highestCostRecipes.slice(0, 5).map((recipe) => (
              <Card key={recipe.id} style={styles.rankCard}>
                <Text style={type.title} numberOfLines={1}>
                  {recipe.name}
                </Text>
                <Text style={styles.costLine}>
                  {formatMoney(recipe.costPerPortion)} per portion
                  {recipe.foodCostPct != null ? ` · ${recipe.foodCostPct.toFixed(1)}% food cost` : ''}
                </Text>
              </Card>
            ))}
          </>
        ) : null}

        <SectionHeader>Manage on web</SectionHeader>
        <View style={styles.footerGroup}>
          <OpenOnWebRow title="Price impact analysis" path="/app/recipe-costing/price-impact" />
          <OpenOnWebRow title="Full costing dashboard" path="/app/recipe-costing" />
        </View>
      </ScrollView>
    </Screen>
  )
}

function AlertRow({ alert }: { alert: RecipeAlert }) {
  const severity = alert.severity ?? 'warning'
  const tone =
    severity === 'error' ? colors.danger : severity === 'info' ? colors.info : colors.warning

  return (
    <Card style={{ ...styles.alertCard, borderLeftColor: tone }}>
      <Text style={type.title}>{recipeAlertMessage(alert)}</Text>
      {alert.alertType ? <Text style={styles.meta}>{alert.alertType}</Text> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  avgCard: { marginBottom: theme.spacing.md },
  avgValue: { fontSize: 32, fontWeight: '800', color: colors.text, marginVertical: 4 },
  meta: { ...type.label, color: colors.textMuted },
  actions: { marginBottom: theme.spacing.md },
  alertCard: {
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 4,
  },
  emptyAlerts: { marginBottom: theme.spacing.md },
  rankCard: { marginBottom: theme.spacing.sm },
  costLine: { ...type.label, marginTop: 4, color: colors.brandDark },
  footerGroup: { gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
})
