import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import {
  useSupplierLoyaltyBalances,
  useSupplierLoyaltyProgram,
} from '../../../services/api/queries/loyalty'
import { usePermissions } from '../../../hooks/usePermissions'
import type { SupplierLoyaltyBalance } from '../../../types/loyalty'
import {
  Card,
  EmptyState,
  FlashList,
  Group,
  LoadingState,
  Metric,
  OperationalRow,
  Screen,
  SectionHeader,
} from '../../../components/ui'
import { OpenOnWebRow } from '../../shared/OpenOnWebRow'
import { colors, theme, type } from '../../../theme'

function formatPoints(value: number | undefined | null): string {
  const n = Number(value ?? 0)
  if (Number.isNaN(n)) return '0'
  return n.toLocaleString()
}

export function SupplierLoyaltyScreen() {
  const { can } = usePermissions()
  const canViewBalances = can('ORDERS_VIEW')
  const programQuery = useSupplierLoyaltyProgram()
  const balancesQuery = useSupplierLoyaltyBalances(canViewBalances)

  if (programQuery.isLoading) return <LoadingState />

  const program = programQuery.data?.program
  const balances = balancesQuery.data?.balances ?? []
  const enabled = program?.enabled ?? false

  return (
    <Screen
      title="Loyalty program"
      subtitle={program?.name ?? 'Partner rewards'}
      scroll={false}
      padded={false}
    >
      <FlashList
        data={canViewBalances ? balances : []}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={programQuery.isRefetching || balancesQuery.isRefetching}
            onRefresh={() => {
              void programQuery.refetch()
              if (canViewBalances) void balancesQuery.refetch()
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.statsRow}>
              <Metric value={enabled ? 'Active' : 'Off'} label="Program status" />
              <Metric value={formatPoints(program?.earn_points_per_currency ?? 0)} label="Points per $1" />
            </View>
            <Card style={styles.summaryCard}>
              <Text style={type.title}>Program rules</Text>
              <Text style={styles.ruleLine}>
                Redeem: {program?.redeem_currency_per_point ?? 0} per point
              </Text>
              <Text style={styles.ruleLine}>
                Min redeem: {formatPoints(program?.min_redeem_points)} points
              </Text>
              <Text style={styles.ruleLine}>
                Max redeem: {program?.max_redeem_percent ?? 0}% of order
              </Text>
              {!program ? (
                <Text style={styles.hint}>No program configured yet — set it up on web.</Text>
              ) : null}
            </Card>
            {canViewBalances ? (
              <SectionHeader style={styles.section}>Restaurant balances</SectionHeader>
            ) : (
              <Card style={styles.summaryCard}>
                <Text style={styles.hint}>
                  Order view permission is required to see restaurant point balances.
                </Text>
              </Card>
            )}
          </View>
        }
        ListEmptyComponent={
          canViewBalances ? (
            balancesQuery.isLoading ? (
              <LoadingState message="Loading balances…" />
            ) : (
              <EmptyState
                icon="people-outline"
                title="No balances yet"
                message="Restaurants earn points when the program is active and they place orders."
              />
            )
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>Manage on web</SectionHeader>
            <Group>
              <OpenOnWebRow title="Edit program settings" path="/app/loyalty" />
            </Group>
          </View>
        }
        renderItem={({ item }) => <BalanceRow balance={item} />}
      />
    </Screen>
  )
}

function BalanceRow({ balance }: { balance: SupplierLoyaltyBalance }) {
  return (
    <OperationalRow
      avatarLabel={balance.restaurant_name}
      title={balance.restaurant_name}
      subtitle={`Earned ${formatPoints(balance.lifetime_earned)} · Redeemed ${formatPoints(balance.lifetime_redeemed)}`}
      meta={`${formatPoints(balance.points_balance)} pts`}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
  header: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.lg, flexWrap: 'wrap' },
  summaryCard: { gap: 6 },
  ruleLine: { color: colors.textMuted, fontWeight: '500' },
  hint: { color: colors.textFaint, fontStyle: 'italic', marginTop: 4 },
  section: { marginTop: theme.spacing.sm, marginBottom: 0 },
  footer: { marginTop: theme.spacing.md },
})
