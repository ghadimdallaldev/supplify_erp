import { StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { usePromotionAnalytics } from '../../../services/api/queries'
import { Card, LoadingState, Screen, StatCard } from '../../../components/ui'
import { formatMoney } from '../../../utils/format'
import { colors, theme } from '../../../theme'
import type { SupplierStackParamList } from '../../../navigation/SupplierNavigator'

type Props = NativeStackScreenProps<SupplierStackParamList, 'DealAnalytics'>

export function DealAnalyticsScreen({ route }: Props) {
  const { dealId, name } = route.params
  const { data, isLoading, isError } = usePromotionAnalytics(dealId)

  if (isLoading) return <LoadingState />

  return (
    <Screen title="Deal analytics" subtitle={name || 'Performance & ROAS'}>
      {isError || !data ? (
        <Card>
          <Text style={styles.error}>Could not load analytics.</Text>
        </Card>
      ) : (
        <View style={styles.grid}>
          <View style={styles.row}>
            <StatCard value={data.views ?? 0} label="Views" icon="eye-outline" tone="info" />
            <StatCard value={data.clicks ?? 0} label="Clicks" icon="hand-left-outline" tone="info" />
          </View>
          <View style={styles.row}>
            <StatCard
              value={data.orders_influenced ?? data.orders ?? 0}
              label="Orders"
              icon="receipt-outline"
              tone="success"
            />
            <StatCard
              value={data.conversionRate != null ? `${data.conversionRate}%` : '—'}
              label="Conversion"
              icon="pulse-outline"
              tone="warning"
            />
          </View>
          <View style={styles.row}>
            <StatCard
              value={formatMoney(Number(data.adSpend || 0))}
              label="Ad spend"
              icon="cash-outline"
              tone="warning"
            />
            <StatCard
              value={formatMoney(Number(data.attributedGmv || 0))}
              label="Attributed GMV"
              icon="trending-up-outline"
              tone="success"
            />
          </View>
          <View style={styles.row}>
            <StatCard
              value={data.roas != null ? `${Number(data.roas).toFixed(2)}x` : '—'}
              label="ROAS"
              icon="analytics-outline"
              tone="info"
            />
            <StatCard
              value={
                data.costPerOrder != null ? formatMoney(Number(data.costPerOrder)) : '—'
              }
              label="Cost / order"
              icon="pricetag-outline"
              tone="warning"
            />
          </View>
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  grid: { gap: theme.spacing.sm },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  error: { color: colors.danger, fontWeight: '600' },
})
