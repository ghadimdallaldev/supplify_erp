import { useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { SupplierStackParamList } from '../../../navigation/SupplierNavigator'
import {
  useDeclineSupplierQuoteRequest,
  useSupplierQuoteInbox,
} from '../../../services/api/queries'
import {
  EmptyState,
  FlashList,
  ListRow,
  LoadingState,
  Screen,
  StatusPill,
} from '../../../components/ui'
import { SearchField } from '../../../components/ui/SearchField'
import { formatDay } from '../../../utils/format'
import { colors, theme } from '../../../theme'
import type { SupplierQuoteInboxEntry, SupplierQuoteInboxStatus } from '../../../types/quotes'

const TABS: Array<{ key: 'all' | SupplierQuoteInboxStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'responded', label: 'Responded' },
  { key: 'declined', label: 'Declined' },
]

/** Whole days from today to `date`; negative once the date has passed. */
function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00`)
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function urgencyLabel(neededBy?: string | null): string | null {
  if (!neededBy) return null
  const days = daysUntil(neededBy)
  if (!Number.isFinite(days) || days > 2) return null
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Due today'
  return `Due in ${days} day${days === 1 ? '' : 's'}`
}

export function QuoteInboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SupplierStackParamList>>()
  const [tab, setTab] = useState<'all' | SupplierQuoteInboxStatus>('all')
  const [search, setSearch] = useState('')

  const query = useSupplierQuoteInbox({
    limit: 50,
    sort: 'needed_by',
    ...(tab === 'all' ? {} : { status: tab }),
    ...(search.trim() ? { search: search.trim() } : {}),
  })
  const decline = useDeclineSupplierQuoteRequest()

  const rows = query.data?.inbox ?? []
  const counts = query.data?.counts

  const subtitle = useMemo(() => {
    if (!counts) return `${rows.length} requests`
    if (counts.urgent > 0) return `${counts.urgent} need a price within 2 days`
    if (counts.pending > 0) return `${counts.pending} awaiting your price`
    return `${counts.total} requests`
  }, [counts, rows.length])

  const confirmDecline = (entry: SupplierQuoteInboxEntry) => {
    Alert.alert(
      'Decline quote request',
      `Decline the request from ${entry.restaurantName}? The restaurant will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            decline.mutate(
              { quoteRequestSupplierId: entry.id },
              {
                onError: () =>
                  Alert.alert('Could not decline', 'Please try again in a moment.'),
              }
            )
          },
        },
      ]
    )
  }

  if (query.isLoading) return <LoadingState />

  return (
    <Screen title="Quote inbox" subtitle={subtitle} padded={false}>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search by restaurant"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((item) => {
          const active = tab === item.key
          const count =
            counts && item.key !== 'all'
              ? counts[item.key]
              : counts
                ? counts.total
                : null
          return (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {item.label}
                {count !== null ? ` ${count}` : ''}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title={search || tab !== 'all' ? 'No matching requests' : 'No quote requests'}
            message={
              search || tab !== 'all'
                ? 'Try a different search or filter.'
                : 'New restaurant pricing requests will appear here.'
            }
          />
        }
        renderItem={({ item }) => {
          const requestOpen = item.quoteRequestStatus === 'open'
          const canDecline = item.status === 'pending' && requestOpen
          const urgency = canDecline ? urgencyLabel(item.neededBy) : null
          const unread = item.status === 'pending' && !item.viewedAt
          const subtitleParts = [
            `${item.itemCount} item${item.itemCount === 1 ? '' : 's'}`,
            formatDay(item.createdAt),
            urgency,
            item.status === 'declined' && item.declineReason
              ? `Declined: ${item.declineReason}`
              : null,
          ].filter(Boolean)

          return (
            <View style={styles.rowWrap}>
              <ListRow
                icon="document-text-outline"
                iconTone={urgency ? 'danger' : item.status === 'pending' ? 'warning' : 'success'}
                title={`${unread ? '● ' : ''}${item.restaurantName}`}
                subtitle={subtitleParts.join(' · ')}
                right={<StatusPill status={item.status} />}
                onPress={() =>
                  navigation.navigate('QuoteResponse', { quoteRequestSupplierId: item.id })
                }
                style={styles.row}
              />
              {canDecline && (
                <Pressable
                  onPress={() => confirmDecline(item)}
                  disabled={decline.isPending}
                  accessibilityRole="button"
                  style={styles.declineButton}
                >
                  <Text style={styles.declineText}>Decline to quote</Text>
                </Pressable>
              )}
            </View>
          )
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: {
    padding: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xxl,
  },
  tabs: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  tab: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: colors.surface },
  rowWrap: { marginBottom: theme.spacing.sm },
  row: { marginBottom: 0 },
  declineButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  declineText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
})
