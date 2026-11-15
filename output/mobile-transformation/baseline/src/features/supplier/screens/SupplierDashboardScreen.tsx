import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../../features/auth/AuthContext'
import { BranchPickerSheet } from '../../shared/BranchPickerSheet'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  useFulfillmentDispatch,
  useNotifications,
  useOrders,
  useSupplierDeliveryBoard,
} from '../../../services/api/queries'
import {
  EmptyState,
  ErrorState,
  Group,
  type IoniconName,
  ListRow,
  ListSkeleton,
  Metric,
  SectionHeader,
} from '../../../components/ui'
import { V2OrderRow } from '../../../components/ui/v2'
import { HomeChrome, MetricStrip } from '../../../components/layout/HomeChrome'
import type { StatusTone } from '../../../theme/colors'
import { formatDay, formatMoney, formatOrderRef } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'
import { t } from '../../../i18n'

/** The supplier's order pipeline, in the order work actually moves through it. */
const PIPELINE: { key: string; label: string; statuses: string[] }[] = [
  { key: 'new', label: 'New', statuses: ['PLACED'] },
  { key: 'confirmed', label: 'Confirmed', statuses: ['ACKNOWLEDGED'] },
  { key: 'preparing', label: 'Preparing', statuses: ['PROCESSING'] },
  { key: 'transit', label: 'In transit', statuses: ['SHIPPED'] },
]

type AttentionItem = {
  key: string
  title: string
  subtitle: string
  icon: IoniconName
  tone: StatusTone
  onPress: () => void
}

export function SupplierDashboardScreen() {
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { can } = usePermissions()
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const ordersQuery = useOrders({ limit: '50' })
  const boardQuery = useSupplierDeliveryBoard()
  const dispatchQuery = useFulfillmentDispatch()
  const notificationsQuery = useNotifications()

  const refreshing =
    ordersQuery.isRefetching || boardQuery.isRefetching || dispatchQuery.isRefetching
  const onRefresh = useCallback(() => {
    void ordersQuery.refetch()
    void boardQuery.refetch()
    void dispatchQuery.refetch()
    void notificationsQuery.refetch()
  }, [ordersQuery.refetch, boardQuery.refetch, dispatchQuery.refetch, notificationsQuery.refetch])

  const allOrders = ordersQuery.data?.orders ?? []
  const placed = allOrders.filter((o) => o.status === 'PLACED')
  const processing = allOrders.filter((o) => ['ACKNOWLEDGED', 'PROCESSING'].includes(o.status))
  const activeDeliveries = boardQuery.data?.orders ?? []
  const dispatchOrders = dispatchQuery.data?.orders ?? []
  const unassigned = dispatchOrders.filter(
    (o) => !(o.assignment?.driver_id ?? o.assignment?.driver_name)
  )
  const openOrders = allOrders.filter((o) =>
    ['PLACED', 'ACKNOWLEDGED', 'PROCESSING'].includes(o.status)
  )
  const openValue = openOrders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0)
  const currency = openOrders[0]?.currency ?? allOrders[0]?.currency ?? 'USD'
  const workspaceTitle = user?.workspace?.tenantName ?? user?.displayName ?? 'Supplier'
  const unread = (notificationsQuery.data ?? []).filter((n) => !n.read).length

  const openOrdersTab = (status?: string) =>
    navigation.navigate('Tabs', { screen: 'Orders', params: status ? { status } : undefined })

  const attention: AttentionItem[] = []
  if (placed.length > 0) {
    attention.push({
      key: 'placed',
      title: `${placed.length} new order${placed.length === 1 ? '' : 's'}`,
      subtitle: 'Acknowledge and confirm',
      icon: 'file-tray-outline',
      tone: 'warning',
      onPress: () => openOrdersTab('new'),
    })
  }
  if (unassigned.length > 0) {
    attention.push({
      key: 'dispatch',
      title: `${unassigned.length} ${unassigned.length === 1 ? 'delivery' : 'deliveries'} without a driver`,
      subtitle: 'Assign from the dispatch board',
      icon: 'car-outline',
      tone: 'danger',
      onPress: () => navigation.navigate('Tabs', { screen: 'Fulfillment' }),
    })
  }
  if (processing.length > 0) {
    attention.push({
      key: 'process',
      title: `${processing.length} in fulfillment`,
      subtitle: 'Advance status or dispatch',
      icon: 'cube-outline',
      tone: 'info',
      onPress: () => openOrdersTab('fulfillment'),
    })
  }
  if (unread > 0) {
    attention.push({
      key: 'alerts',
      title: `${unread} unread alert${unread === 1 ? '' : 's'}`,
      subtitle: 'Notifications',
      icon: 'notifications-outline',
      tone: 'brand',
      onPress: () => navigation.navigate('Notifications'),
    })
  }

  const nextOrder = placed[0] ?? processing[0] ?? allOrders[0]
  const pickCount = allOrders.filter((o) =>
    ['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED'].includes(o.status)
  ).length

  const chrome = (
    <HomeChrome
      title={workspaceTitle}
      subtitle={user?.workspace?.roleName ?? undefined}
      notificationCount={unread}
      onNotifications={() => navigation.navigate('Notifications')}
      onWorkspacePress={() => setWorkspaceOpen(true)}
      workspaceLabel="Switch account"
    />
  )

  if (ordersQuery.isLoading || boardQuery.isLoading || dispatchQuery.isLoading) {
    return (
      <View style={styles.root}>
        {chrome}
        <ListSkeleton rows={6} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.lg }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
      }
    >
      {chrome}

      <MetricStrip>
        <Metric value={openOrders.length} label="Open orders" />
        <Metric value={activeDeliveries.length} label="Out for delivery" />
        <Metric value={formatMoney(openValue, currency)} label="Open value" />
      </MetricStrip>

      {/* The supplier's signature view: where every live order currently sits. */}
      <SectionHeader>Order pipeline</SectionHeader>
      <View style={styles.pipeline}>
        {PIPELINE.map((stage, index) => {
          const count = allOrders.filter((o) => stage.statuses.includes(o.status)).length
          return (
            <Pressable
              key={stage.key}
              style={({ pressed }) => [
                styles.stage,
                index > 0 && styles.stageDivided,
                pressed && styles.stagePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${count} ${stage.label}`}
              onPress={() => openOrdersTab(stage.key)}
            >
              <Text style={[styles.stageCount, count === 0 && styles.stageCountZero]}>{count}</Text>
              <Text style={styles.stageLabel} numberOfLines={2}>
                {stage.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {attention.length > 0 ? (
        <>
          <SectionHeader>{t('needsAttention')}</SectionHeader>
          <Group>
            {attention.map((item) => (
              <ListRow
                key={item.key}
                icon={item.icon}
                tone={item.tone}
                title={item.title}
                subtitle={item.subtitle}
                onPress={item.onPress}
              />
            ))}
          </Group>
        </>
      ) : null}

      <SectionHeader>{t('happeningToday')}</SectionHeader>
      <Group>
        <ListRow
          icon="git-network-outline"
          title="Dispatch board"
          subtitle={`${activeDeliveries.length} active · ${unassigned.length} unassigned`}
          onPress={() => navigation.navigate('Tabs', { screen: 'Fulfillment' })}
        />
        {can('FULFILLMENT_VIEW') ? (
          <ListRow
            icon="list-outline"
            title="Pick lists"
            subtitle={`${pickCount} order${pickCount === 1 ? '' : 's'} in the pick queue`}
            onPress={() => navigation.navigate('PickLists')}
          />
        ) : null}
        <ListRow
          icon="document-text-outline"
          title="Run sheet"
          subtitle="Operations summary for today"
          onPress={() => navigation.navigate('RunSheet')}
        />
      </Group>

      {nextOrder ? (
        <>
          <SectionHeader>{t('upNext')}</SectionHeader>
          <V2OrderRow
            title={nextOrder.restaurant_name ?? 'Order'}
            subtitle={formatDay(nextOrder.created_at)}
            note={formatOrderRef(nextOrder.id)}
            meta={formatMoney(nextOrder.total_amount, nextOrder.currency)}
            status={nextOrder.status}
            domain="order"
            onPress={() => navigation.navigate('OrderDetail', { orderId: nextOrder.id })}
          />
        </>
      ) : null}

      <SectionHeader
        action={allOrders.length > 0 ? 'See all' : undefined}
        onAction={allOrders.length > 0 ? () => openOrdersTab() : undefined}
      >
        {t('recent')}
      </SectionHeader>
      {ordersQuery.isError ? (
        <ErrorState message="Could not load orders." onRetry={() => void ordersQuery.refetch()} />
      ) : allOrders.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No orders yet"
          message="Orders placed by your customers will appear here."
        />
      ) : (
        allOrders.slice(0, 8).map((order) => (
          <V2OrderRow
            key={order.id}
            title={order.restaurant_name ?? 'Order'}
            subtitle={formatDay(order.created_at)}
            note={formatOrderRef(order.id)}
            meta={formatMoney(order.total_amount, order.currency)}
            status={order.status}
            domain="order"
            onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
          />
        ))
      )}
      <BranchPickerSheet visible={workspaceOpen} onClose={() => setWorkspaceOpen(false)} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  pipeline: {
    flexDirection: 'row',
    marginHorizontal: theme.gutter,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  stage: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
  },
  stageDivided: { borderStartWidth: theme.hairline, borderStartColor: colors.separator },
  stagePressed: { backgroundColor: colors.surfaceMuted },
  stageCount: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  stageCountZero: { color: colors.textFaint },
  stageLabel: { ...type.caption, textAlign: 'center' },
})
