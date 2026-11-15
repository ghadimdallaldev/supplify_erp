import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  usePayActivation,
  usePausePromotion,
  usePromotionsAnalyticsSummary,
  useSupplierPromotions,
} from '../../../services/api/queries'
import { PaymentRequiredError } from '../../../services/api/client'
import { Card, EmptyState, ListRow, LoadingState, Screen, StatCard } from '../../../components/ui'
import { formatMoney } from '../../../utils/format'
import type { SupplierPromotion } from '../../../types/promotions'
import { colors, theme } from '../../../theme'

export function SupplierPromotionsScreen() {
  const navigation = useNavigation<any>()
  const { data: promotions = [], isLoading, isError, refetch } = useSupplierPromotions()
  const summaryQuery = usePromotionsAnalyticsSummary(30)
  const payActivation = usePayActivation()
  const pausePromotion = usePausePromotion()
  const summary = summaryQuery.data

  const handlePay = async (deal: SupplierPromotion) => {
    try {
      await payActivation.mutateAsync({
        id: deal.id,
        idempotencyKey: `deal-boost:${deal.id}:${deal.boost_price_snapshot || 0}`,
      })
      Alert.alert('Boost paid', 'Your deal is now live.')
      void refetch()
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        const fallbackAmount = Number(deal.boost_price_snapshot) || 0
        const amount = err.amount != null ? err.amount : fallbackAmount
        Alert.alert(
          'Payment required',
          err.message || `Add a payment method to pay ${formatMoney(amount)} for this boost.`
        )
        return
      }
      Alert.alert('Payment failed', err instanceof Error ? err.message : 'Could not pay boost')
    }
  }

  const handlePause = async (id: string) => {
    try {
      await pausePromotion.mutateAsync(id)
      void refetch()
    } catch (err) {
      Alert.alert('Pause failed', err instanceof Error ? err.message : 'Could not pause deal')
    }
  }

  if (isLoading) return <LoadingState />

  return (
    <Screen title="Deals & boosts" subtitle="Create, pay, and track promotions" padded={false}>
      {isError ? (
        <View style={styles.pad}>
          <Card>
            <Text style={styles.error}>Could not load promotions.</Text>
          </Card>
        </View>
      ) : (
        <FlatList
          data={promotions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.statsRow}>
                <StatCard
                  value={summary?.activeDeals ?? 0}
                  label="Live deals"
                  icon="pricetag-outline"
                  tone="success"
                />
                <StatCard
                  value={
                    summary?.roas != null ? `${Number(summary.roas).toFixed(1)}x` : '—'
                  }
                  label="ROAS (30d)"
                  icon="trending-up-outline"
                  tone="info"
                />
              </View>
              <StatCard
                value={formatMoney(Number(summary?.adSpend || 0))}
                label="Ad spend (30d)"
                icon="cash-outline"
                tone="warning"
                style={styles.fullStat}
              />
              <ListRow
                icon="add-circle-outline"
                iconTone="brand"
                title="Create deal"
                subtitle="Discount + boost targeting"
                onPress={() => navigation.navigate('CreateDeal')}
              />
              <ListRow
                icon="star-outline"
                iconTone="warning"
                title="Featured placement"
                subtitle="Top of supplier discovery"
                onPress={() => navigation.navigate('FeaturedPlacement')}
              />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="pricetag-outline"
              title="No deals yet"
              message="Create a deal and pick a boost package to reach restaurants."
            />
          }
          renderItem={({ item }) => (
            <DealRow
              deal={item}
              onPay={() => handlePay(item)}
              onPause={() => handlePause(item.id)}
              onAnalytics={() => navigation.navigate('DealAnalytics', { dealId: item.id, name: item.name })}
              paying={payActivation.isPending}
            />
          )}
        />
      )}
    </Screen>
  )
}

function DealRow({
  deal,
  onPay,
  onPause,
  onAnalytics,
  paying,
}: {
  deal: SupplierPromotion
  onPay: () => void
  onPause: () => void
  onAnalytics: () => void
  paying: boolean
}) {
  const pendingPay = deal.status === 'approved_pending_payment'
  return (
    <Card style={styles.card}>
      <Text style={styles.title} numberOfLines={1}>
        {deal.name}
      </Text>
      <Text style={styles.meta}>
        {deal.status.replace(/_/g, ' ')}
        {deal.payment_status ? ` · ${deal.payment_status}` : ''}
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={onAnalytics} style={styles.linkBtn}>
          <Text style={styles.linkText}>Analytics</Text>
        </Pressable>
        {pendingPay ? (
          <Pressable onPress={onPay} disabled={paying} style={styles.payBtn}>
            <Text style={styles.payText}>
              Pay {formatMoney(Number(deal.boost_price_snapshot || 0))}
            </Text>
          </Pressable>
        ) : null}
        {deal.status === 'active' || deal.status === 'scheduled' ? (
          <Pressable onPress={onPause} style={styles.linkBtn}>
            <Text style={styles.linkText}>Pause</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  pad: { padding: theme.spacing.md },
  list: { padding: theme.spacing.md, paddingTop: 0, paddingBottom: theme.spacing.xxl },
  header: { marginBottom: theme.spacing.sm, gap: theme.spacing.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  fullStat: { marginBottom: theme.spacing.xs },
  error: { color: colors.danger, fontWeight: '600' },
  card: { marginBottom: theme.spacing.sm },
  title: { fontWeight: '700', color: colors.text, fontSize: 16 },
  meta: { marginTop: 4, color: colors.textMuted, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  linkText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  payBtn: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  payText: { color: colors.onBrand, fontWeight: '700', fontSize: 13 },
})
