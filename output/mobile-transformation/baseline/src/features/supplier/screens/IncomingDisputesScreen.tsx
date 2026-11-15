import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useIncomingDisputes } from '../../../services/api/queries'
import {
  disputeCreatedAt,
  disputeOrderId,
  disputePartyName,
  disputeType,
  type Dispute,
} from '../../../types/disputes'
import type { SupplierStackParamList } from '../../../navigation/SupplierNavigator'
import { EmptyState, ListRow, LoadingState, Screen, StatusPill } from '../../../components/ui'
import { formatShortDate } from '../../../utils/format'
import { colors, theme } from '../../../theme'

export function IncomingDisputesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SupplierStackParamList>>()
  const { data, isLoading, isError } = useIncomingDisputes()

  if (isLoading) return <LoadingState />

  const disputes = data ?? []

  return (
    <Screen title="Incoming disputes" subtitle={`${disputes.length} open`} padded={false}>
      {isError ? (
        <View style={styles.pad}>
          <Text style={styles.error}>Could not load disputes.</Text>
        </View>
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="scale-outline"
              title="No disputes"
              message="Restaurant disputes filed against your orders appear here."
            />
          }
          renderItem={({ item }) => (
            <DisputeRow
              dispute={item}
              onPress={() => navigation.navigate('DisputeDetail', { disputeId: item.id })}
            />
          )}
        />
      )}
    </Screen>
  )
}

function DisputeRow({ dispute, onPress }: { dispute: Dispute; onPress: () => void }) {
  const restaurantName = disputePartyName(dispute, 'SUPPLIER')
  const orderId = disputeOrderId(dispute)
  const createdAt = disputeCreatedAt(dispute)
  const typeLabel = disputeType(dispute)

  const metaParts = [
    orderId ? `Order ${orderId.slice(0, 8)}` : null,
    formatShortDate(createdAt) || null,
  ].filter(Boolean) as string[]

  const subtitleParts = [
    typeLabel.replace(/_/g, ' '),
    dispute.description?.trim() || null,
    metaParts.length ? metaParts.join(' · ') : null,
  ].filter(Boolean) as string[]

  return (
    <ListRow
      icon="alert-circle-outline"
      title={restaurantName}
      subtitle={subtitleParts.join('\n')}
      onPress={onPress}
      showChevron
      right={<StatusPill status={dispute.status} domain="dispute" />}
    />
  )
}

const styles = StyleSheet.create({
  pad: { padding: theme.spacing.lg },
  list: { paddingBottom: theme.spacing.xxl },
  error: { color: colors.danger, fontWeight: '600' },
})
