import { useEffect, useMemo, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import {
  useConsumerLoyaltyProgram,
  useUpsertConsumerLoyaltyProgram,
} from '../../../services/api/queries'
import type { ConsumerLoyaltyProgram } from '../../../types/consumer'
import { usePermissions } from '../../../hooks/usePermissions'
import { ApiError } from '../../../services/api/client'
import { OpenOnWebRow } from '../../shared/OpenOnWebRow'
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  SectionHeader,
  StatCard,
  StatusPill,
} from '../../../components/ui'
import { colors, theme, type } from '../../../theme'

const DEFAULT_PROGRAM_NAME = 'Guest rewards'

function multiplierValue(program: ConsumerLoyaltyProgram | null | undefined, ...keys: string[]): number | null {
  const multipliers = program?.rules_json?.fulfillment_multipliers ?? {}
  for (const key of keys) {
    const value = multipliers[key]
    if (value != null && !Number.isNaN(Number(value))) return Number(value)
  }
  return null
}

export function ConsumerLoyaltyScreen() {
  const { can, canAny } = usePermissions()
  const canManage = canAny('CATALOG_EDIT', 'CATALOG_MANAGE')
  const query = useConsumerLoyaltyProgram()
  const saveProgram = useUpsertConsumerLoyaltyProgram()

  const program = query.data
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(program?.enabled ?? false)
  }, [program?.enabled])

  const summary = useMemo(() => {
    const earn = program?.earn_points_per_currency ?? 1
    const redeem = program?.redeem_currency_per_point ?? 0.01
    const minRedeem = program?.min_redeem_points ?? 50
    const maxRedeem = program?.max_redeem_percent ?? 50
    const welcome = program?.welcome_bonus_points ?? 0
    return {
      earn,
      redeem,
      minRedeem,
      maxRedeem,
      welcome,
      takeaway: multiplierValue(program, 'TAKEAWAY', 'pickup'),
      delivery: multiplierValue(program, 'DELIVERY', 'delivery'),
      dineIn: multiplierValue(program, 'DINE_IN', 'dine_in'),
    }
  }, [program])

  const toggleEnabled = async (next: boolean) => {
    if (!canManage) return
    setEnabled(next)
    try {
      await saveProgram.mutateAsync({
        enabled: next,
        name: program?.name ?? DEFAULT_PROGRAM_NAME,
      })
    } catch (error) {
      setEnabled(program?.enabled ?? false)
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not update program'
      Alert.alert('Could not save', message)
    }
  }

  if (query.isLoading) return <LoadingState />

  if (query.isError) {
    return (
      <Screen title="Guest rewards">
        <EmptyState
          title="Could not load program"
          message="Check your connection and try again."
          icon="gift-outline"
        />
        <Button label="Retry" variant="outline" onPress={() => void query.refetch()} />
      </Screen>
    )
  }

  const programName = program?.name?.trim() || DEFAULT_PROGRAM_NAME

  return (
    <Screen title="Guest rewards" subtitle="Consumer loyalty for guest checkout" scroll={false} padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <StatCard
            value={enabled ? 'Live' : 'Off'}
            label="Program status"
            icon="gift-outline"
            tone={enabled ? 'success' : 'neutral'}
          />
          <StatCard
            value={summary.earn}
            label="Points per $1"
            icon="star-outline"
            tone="brand"
          />
        </View>

        <Card style={styles.programCard}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={type.title}>{programName}</Text>
              <Text style={styles.subtitle}>
                Guests earn points on orders and redeem them at checkout.
              </Text>
            </View>
            <StatusPill status={enabled ? 'Active' : 'Disabled'} />
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.flex}>
              <Text style={type.title}>Program enabled</Text>
              <Text style={styles.subtitle}>
                {canManage
                  ? 'Turn guest rewards on or off for your storefront.'
                  : 'Only managers can change program settings.'}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(value) => void toggleEnabled(value)}
              disabled={!canManage || saveProgram.isPending}
              trackColor={{ false: colors.borderStrong, true: colors.brandLight }}
              thumbColor={enabled ? colors.brand : colors.surface}
            />
          </View>
        </Card>

        <SectionHeader>Earn & redeem</SectionHeader>
        <Card style={styles.rulesCard}>
          <RuleRow label="Earn rate" value={`${summary.earn} point${summary.earn === 1 ? '' : 's'} per $1 spent`} />
          <RuleRow
            label="Redeem value"
            value={`$${summary.redeem.toFixed(3)} per point`}
          />
          <RuleRow label="Minimum redeem" value={`${summary.minRedeem} points`} />
          <RuleRow label="Max redeem per order" value={`${summary.maxRedeem}% of subtotal`} />
          {summary.welcome > 0 ? (
            <RuleRow label="Welcome bonus" value={`${summary.welcome} points`} />
          ) : null}
        </Card>

        <SectionHeader>Fulfillment multipliers</SectionHeader>
        <Card style={styles.rulesCard}>
          <RuleRow
            label="Takeaway"
            value={summary.takeaway != null ? `${summary.takeaway}×` : '1×'}
          />
          <RuleRow
            label="Delivery"
            value={summary.delivery != null ? `${summary.delivery}×` : '1.25×'}
          />
          <RuleRow
            label="Dine in"
            value={summary.dineIn != null ? `${summary.dineIn}×` : '1.5×'}
          />
        </Card>

        {!canManage ? (
          <Text style={styles.readOnlyHint}>
            You can view program rules here. Managers can edit earn/redeem settings on web.
          </Text>
        ) : null}

        <SectionHeader>Manage on web</SectionHeader>
        <View style={styles.footerGroup}>
          <OpenOnWebRow title="Edit earn & redeem rules" path="/app/consumer-loyalty" />
        </View>
      </ScrollView>
    </Screen>
  )
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <Text style={type.title}>{value}</Text>
    </View>
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
    marginBottom: theme.spacing.md,
  },
  programCard: { marginBottom: theme.spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  flex: { flex: 1 },
  subtitle: { ...type.label, marginTop: 4, color: colors.textMuted },
  rulesCard: { paddingVertical: 0, marginBottom: theme.spacing.md },
  ruleRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ruleLabel: { ...type.caption, color: colors.textMuted, marginBottom: 2 },
  readOnlyHint: {
    ...type.label,
    color: colors.textMuted,
    marginBottom: theme.spacing.md,
  },
  footerGroup: { gap: theme.spacing.sm },
})
