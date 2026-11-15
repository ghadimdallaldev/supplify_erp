import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../../features/auth/AuthContext'
import { BranchPickerSheet } from '../../shared/BranchPickerSheet'
import { useEntitlementMap } from '../../../hooks/useEntitlements'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  useOrders,
  useNotifications,
  usePendingReceiving,
  useSuppliers,
} from '../../../services/api/queries'
import { useCartStore } from '../../../store/cartStore'
import {
  EmptyState,
  ErrorState,
  type IoniconName,
  ListRow,
  ListSkeleton,
  Metric,
  SectionHeader,
} from '../../../components/ui'
import { V2OrderRow, V2QuickActionTile, V2SectionHeader } from '../../../components/ui/v2'
import { HomeChrome, MetricStrip } from '../../../components/layout/HomeChrome'
import type { StatusTone } from '../../../theme/colors'
import { formatDay, formatMoney, formatOrderRef } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'
import { t } from '../../../i18n'
import { moneyTotals } from '../../../lib/cartCurrency'

type AttentionItem = {
  key: string
  title: string
  subtitle: string
  icon: IoniconName
  tone: StatusTone
  onPress: () => void
}

export function RestaurantDashboardScreen() {
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { can, canAny } = usePermissions()
  const { isEnabled, isLoading: entitlementsLoading } = useEntitlementMap()
  const canViewOrders = can('ORDERS_VIEW')
  const canReceive = canAny('RECEIVING_VIEW', 'RECEIVING_MANAGE')
  const ordersQuery = useOrders({ limit: '10' }, canViewOrders)
  const notificationsQuery = useNotifications()
  const receivingQuery = usePendingReceiving(canReceive)
  const suppliersQuery = useSuppliers()
  const cartItems = useCartStore((s) => s.items)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)

  const refreshing =
    ordersQuery.isRefetching ||
    notificationsQuery.isRefetching ||
    receivingQuery.isRefetching ||
    suppliersQuery.isRefetching
  const onRefresh = useCallback(() => {
    void ordersQuery.refetch()
    void notificationsQuery.refetch()
    void receivingQuery.refetch()
    void suppliersQuery.refetch()
  }, [
    ordersQuery.refetch,
    notificationsQuery.refetch,
    receivingQuery.refetch,
    suppliersQuery.refetch,
  ])

  const orders = ordersQuery.data?.orders ?? []
  const openOrders = orders.filter((order) =>
    ['PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED'].includes(order.status)
  )
  const readyToReceive = (receivingQuery.data?.orders ?? []).filter((o) =>
    ['DELIVERED', 'COMPLETED'].includes(o.status)
  )
  const inTransit = openOrders.filter((o) => o.status === 'SHIPPED')
  const openValue = moneyTotals(openOrders.map((order) => ({
    currency: order.currency,
    amount: Number(order.total_amount) || 0,
  }))).map((entry) => formatMoney(entry.subtotal, entry.currency)).join(' + ')
  const unread = (notificationsQuery.data ?? []).filter((n) => !n.read).length
  const toReceiveCount = receivingQuery.data?.orders?.length ?? 0
  const workspaceTitle = user?.workspace?.tenantName ?? user?.displayName ?? 'Restaurant'
  const branchLabel = user?.workspace?.roleName ?? undefined

  const followedSuppliers = useMemo(
    () => (suppliersQuery.data?.suppliers ?? []).filter((s) => s.is_followed).slice(0, 8),
    [suppliersQuery.data?.suppliers]
  )

  const attention: AttentionItem[] = []
  if (canReceive && isEnabled('receiving_quality') && readyToReceive.length > 0) {
    attention.push({
      key: 'receive',
      title: `${readyToReceive.length} ready to receive`,
      subtitle: 'Confirm delivery and quality',
      icon: 'cube-outline',
      tone: 'warning',
      onPress: () => navigation.navigate('ReceivingHub'),
    })
  }
  if (canViewOrders && inTransit.length > 0) {
    const first = inTransit[0]
    attention.push({
      key: 'transit',
      title:
        inTransit.length === 1
          ? 'Delivery in transit'
          : `${inTransit.length} deliveries in transit`,
      subtitle: first.supplier_name ?? 'View order',
      icon: 'navigate-outline',
      tone: 'info',
      onPress: () =>
        inTransit.length === 1
          ? navigation.navigate('OrderDetail', { orderId: first.id })
          : navigation.navigate('Orders'),
    })
  }
  if (canViewOrders && openOrders.length > 0) {
    attention.push({
      key: 'open',
      title: `${openOrders.length} open order${openOrders.length === 1 ? '' : 's'}`,
      subtitle: 'Among your 10 latest orders',
      icon: 'receipt-outline',
      tone: 'info',
      onPress: () => navigation.navigate('Orders'),
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

  const nextAction =
    can('ORDERS_CREATE') && cartItems.length > 0
      ? {
          title: 'Resume cart',
          subtitle: `${cartItems.length} line${cartItems.length === 1 ? '' : 's'} · ${new Set(cartItems.map((i) => i.product.supplier_id)).size} supplier(s)`,
          icon: 'cart-outline' as IoniconName,
          onPress: () => navigation.navigate('Cart'),
        }
      : canViewOrders && openOrders[0]
        ? {
            title: openOrders[0].supplier_name ?? 'Open order',
            subtitle: `${openOrders[0].status} · ${formatMoney(openOrders[0].total_amount, openOrders[0].currency)}`,
            icon: 'receipt-outline' as IoniconName,
            onPress: () => navigation.navigate('OrderDetail', { orderId: openOrders[0].id }),
          }
        : can('CATALOG_VIEW')
          ? {
              title: 'Browse suppliers',
              subtitle: 'Find products and place an order',
              icon: 'storefront-outline' as IoniconName,
              onPress: () => navigation.navigate('Shop'),
            }
          : null

  const quickActions = useMemo(() => {
    const tiles: Array<{ key: string; icon: IoniconName; label: string; onPress: () => void }> = []
    if (can('CATALOG_VIEW')) {
      tiles.push({
        key: 'order',
        icon: 'add-circle-outline',
        label: 'New order',
        onPress: () => navigation.navigate('Shop'),
      })
    }
    if (
      can('ORDERS_CREATE') &&
      can('ORDERS_VIEW') &&
      !entitlementsLoading &&
      isEnabled('quick_lists')
    ) {
      tiles.push({
        key: 'reorder',
        icon: 'list-outline',
        label: 'Quick lists',
        onPress: () => navigation.navigate('QuickLists'),
      })
    }
    if (can('INVOICES_VIEW') && !entitlementsLoading && isEnabled('finance_invoices')) {
      tiles.push({
        key: 'invoices',
        icon: 'document-text-outline',
        label: 'Invoices',
        onPress: () => navigation.navigate('Invoices'),
      })
    }
    if (
      can('CHAT_VIEW') &&
      can('CHAT_SEND') &&
      !entitlementsLoading &&
      isEnabled('chat')
    ) {
      tiles.push({
        key: 'support',
        icon: 'chatbubble-ellipses-outline',
        label: 'Messages',
        onPress: () => navigation.navigate('Chat'),
      })
    }
    if (
      !entitlementsLoading &&
      isEnabled('reports') &&
      canAny('ORDERS_VIEW', 'INVOICES_VIEW')
    ) {
      tiles.push({
        key: 'reports',
        icon: 'bar-chart-outline',
        label: 'Reports',
        onPress: () => navigation.navigate('Reports'),
      })
    }
    return tiles
  }, [can, canAny, entitlementsLoading, isEnabled, navigation])

  const chrome = (
    <HomeChrome
      title={workspaceTitle}
      subtitle={branchLabel}
      notificationCount={unread}
      onNotifications={() => navigation.navigate('Notifications')}
      onWorkspacePress={() => setWorkspaceOpen(true)}
      workspaceLabel="Switch branch"
    />
  )

  if (ordersQuery.isLoading || notificationsQuery.isLoading || receivingQuery.isLoading) {
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

      {attention.length > 0 ? (
        <Text style={styles.statusLine}>
          {attention.length} item{attention.length === 1 ? '' : 's'} need attention
        </Text>
      ) : null}

      {canViewOrders || canReceive ? (
        <MetricStrip>
          {canViewOrders ? <Metric value={openOrders.length} label="Recent open orders" /> : null}
          {canReceive ? (
            <Metric
              value={toReceiveCount}
              label="Receiving queue"
              tone={readyToReceive.length > 0 ? 'warning' : undefined}
            />
          ) : null}
          {canViewOrders && openOrders[0] ? (
            <Metric
              value={openValue}
              label="Recent open value"
            />
          ) : null}
        </MetricStrip>
      ) : null}

      {canViewOrders ? <Text style={styles.statusLine}>Order figures cover your 10 latest orders.</Text> : null}

      {attention.length > 0 ? (
        <>
          <V2SectionHeader>{t('needsAttention')}</V2SectionHeader>
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
        </>
      ) : null}

      {nextAction ? (
        <>
          <V2SectionHeader>{t('upNext')}</V2SectionHeader>
          <ListRow
            icon={nextAction.icon}
            title={nextAction.title}
            subtitle={nextAction.subtitle}
            onPress={nextAction.onPress}
          />
        </>
      ) : null}

      {quickActions.length > 0 ? (
        <>
          <V2SectionHeader>Quick actions</V2SectionHeader>
          <View style={styles.quickRow}>
            {quickActions.map((tile) => (
              <V2QuickActionTile
                key={tile.key}
                icon={tile.icon}
                label={tile.label}
                onPress={tile.onPress}
              />
            ))}
          </View>
        </>
      ) : null}

      {can('CATALOG_VIEW') && followedSuppliers.length > 0 ? (
        <>
          <V2SectionHeader
            action="See all"
            onAction={() => navigation.navigate('Shop')}
          >
            Following
          </V2SectionHeader>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.followedRow}
          >
            {followedSuppliers.map((supplier) => (
              <Pressable
                key={supplier.id}
                onPress={() =>
                  navigation.navigate('Catalog', {
                    supplierId: supplier.id,
                    supplierName: supplier.name,
                  })
                }
                style={styles.followedChip}
                accessibilityRole="button"
              >
                <View style={styles.followedAvatar}>
                  <Text style={styles.followedLetter}>
                    {(supplier.name.trim()[0] ?? '?').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.followedName} numberOfLines={1}>
                  {supplier.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {canViewOrders ? (
        <>
          <SectionHeader
            action={orders.length > 0 ? 'See all' : undefined}
            onAction={orders.length > 0 ? () => navigation.navigate('Orders') : undefined}
          >
            {t('recent')}
          </SectionHeader>
          {ordersQuery.isError ? (
            <ErrorState
              message="Could not load your orders."
              onRetry={() => void ordersQuery.refetch()}
            />
          ) : orders.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title={t('noOpenOrders')}
              message="Orders you place will appear here."
            />
          ) : (
            orders.slice(0, 8).map((order) => (
              <V2OrderRow
                key={order.id}
                title={order.supplier_name ?? 'Order'}
                subtitle={formatDay(order.created_at)}
                note={formatOrderRef(order.id)}
                meta={formatMoney(order.total_amount, order.currency)}
                status={order.status}
                domain="order"
                onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
              />
            ))
          )}
        </>
      ) : null}
      <BranchPickerSheet visible={workspaceOpen} onClose={() => setWorkspaceOpen(false)} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  statusLine: {
    ...type.caption,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.sm,
    color: colors.textMuted,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.md,
  },
  followedRow: {
    paddingHorizontal: theme.gutter,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  followedChip: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  followedAvatar: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followedLetter: { fontSize: 16, fontWeight: '700', color: colors.brandDark },
  followedName: { fontSize: 11, fontWeight: '600', color: colors.text, textAlign: 'center', width: '100%' },
})
