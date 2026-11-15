import { useEffect, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../services/api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, EmptyState, LoadingState, Screen, StatusPill } from '../../components/ui'
import { colors, theme, type } from '../../theme'
import { loadGuestOrders, type GuestOrderRecord } from './guestOrders'
import { useConsumerPublicOrder, useConsumerPublicOrders } from './api'
import type { ConsumerAddress, ConsumerReorderPreview } from './types'
import { usePublicCart } from './store'

const money = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)

export function GuestTrackingHistoryScreen() {
  const navigation = useNavigation<any>()
  const [orders, setOrders] = useState<GuestOrderRecord[]>([])
  useEffect(() => {
    void loadGuestOrders().then(setOrders)
  }, [])
  return (
    <Screen title="Recent guest orders" padded={false}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.token}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="No guest orders"
            message="Orders placed as a guest are stored securely on this device."
          />
        }
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('Receipt', { token: item.token })}>
            <Text style={type.title}>{item.reference}</Text>
            <Text style={styles.muted}>
              {item.supplierName || 'Supplier'} · {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </Card>
        )}
      />
    </Screen>
  )
}

export function ConsumerOrdersScreen() {
  const navigation = useNavigation<any>()
  const query = useConsumerPublicOrders()
  if (query.isLoading) return <LoadingState />
  if (query.isError) {
    return (
      <Screen title="Orders">
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load orders"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      </Screen>
    )
  }
  return (
    <Screen title="Orders" padded={false}>
      <FlatList
        data={query.data?.orders || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="No orders yet"
            message="Orders you place from public supplier catalogs will appear here."
          />
        }
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('ConsumerOrderDetail', { orderId: item.id })}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={type.title}>{item.reference}</Text>
                <Text style={styles.muted}>
                  {item.supplierName} · {money(item.total, item.currency)}
                </Text>
              </View>
              <StatusPill
                status={item.status === 'PLACED' ? 'PENDING CONFIRMATION' : item.status}
                domain="order"
              />
            </View>
          </Card>
        )}
      />
    </Screen>
  )
}

export function ConsumerOrderDetailScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const replaceCart = usePublicCart((state) => state.replace)
  const query = useConsumerPublicOrder(String(route.params?.orderId || ''))
  const reorder = useMutation({
    mutationFn: () =>
      api.post<ConsumerReorderPreview>(`/api/consumer/orders/${route.params.orderId}/reorder-preview`),
  })
  if (query.isLoading) return <LoadingState />
  const order = query.data?.order
  if (!order) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Order unavailable"
        message="This order does not belong to this account."
      />
    )
  }
  return (
    <Screen title={order.reference} scroll>
      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={type.h2}>{order.supplierName}</Text>
            <Text style={styles.muted}>
              {order.fulfillmentMethod} · {order.paymentMethod.replace(/_/g, ' ')}
            </Text>
          </View>
          <StatusPill status={order.status} domain="order" />
        </View>
        <Text style={styles.total}>{money(order.total, order.currency)}</Text>
      </Card>
      {order.items.map((item) => (
        <Card key={item.productId}>
          <Text style={type.title}>{item.name}</Text>
          <Text style={styles.muted}>
            {item.quantity} × {money(item.unitPrice, order.currency)}
          </Text>
        </Card>
      ))}
      <Button
        label="Reorder preview"
        loading={reorder.isPending}
        onPress={() =>
          void reorder
            .mutateAsync()
            .then((result) => {
              const unavailable = result.items.filter((item) => !item.available)
              const available = result.items.filter((item) => item.available && item.product)
              if (!available.length || !result.storefrontId || !result.supplierLocationId) {
                Alert.alert('No available items', 'No items from this order can currently be reordered.')
                return
              }
              replaceCart(
                result.storefrontId,
                result.supplierLocationId,
                available.map((item) => ({ product: item.product!, quantity: item.quantity }))
              )
              Alert.alert(
                'Cart rebuilt',
                unavailable.length
                  ? `${available.length} item(s) use current public prices; ${unavailable.length} unavailable item(s) were excluded.`
                  : 'All items were rebuilt using current public prices and availability.',
                [{ text: 'Review cart', onPress: () => navigation.navigate('Cart') }]
              )
            })
            .catch((error) => Alert.alert('Unable to preview', error.message))
        }
      />
    </Screen>
  )
}

export function ConsumerAccountScreen() {
  const navigation = useNavigation<any>()
  const { logout, user } = useAuth()
  const profile = useQuery({
    queryKey: ['public-shop', 'profile'],
    queryFn: () => api.get<{ profile: { email?: string; display_name?: string; phone?: string } }>(
      '/api/consumer/profile'
    ),
  })
  const addresses = useQuery({
    queryKey: ['public-shop', 'addresses'],
    queryFn: () => api.get<{ addresses: ConsumerAddress[] }>('/api/consumer/addresses'),
  })
  const update = useMutation({
    mutationFn: (body: object) => api.patch('/api/consumer/profile', body),
    onSuccess: () => void profile.refetch(),
  })
  const createAddress = useMutation({
    mutationFn: (body: object) => api.post('/api/consumer/addresses', body),
    onSuccess: () => {
      void addresses.refetch()
      setRecipient('')
      setAddressPhone('')
      setLine1('')
      setCity('')
      setCountry('')
    },
  })
  const setDefaultAddress = useMutation({
    mutationFn: (id: string) => api.patch(`/api/consumer/addresses/${id}`, { isDefault: true }),
    onSuccess: () => void addresses.refetch(),
  })
  const deleteAddress = useMutation({
    mutationFn: (id: string) => api.delete(`/api/consumer/addresses/${id}`),
    onSuccess: () => void addresses.refetch(),
  })
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [recipient, setRecipient] = useState('')
  const [addressPhone, setAddressPhone] = useState('')
  const [line1, setLine1] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [profileSeeded, setProfileSeeded] = useState(false)

  useEffect(() => {
    if (profileSeeded || !profile.data?.profile) return
    setName(profile.data.profile.display_name || '')
    setPhone(profile.data.profile.phone || '')
    setProfileSeeded(true)
  }, [profile.data, profileSeeded])

  const field = (placeholder: string, value: string, setter: (value: string) => void) => (
    <TextInput
      placeholder={placeholder}
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={setter}
      style={styles.input}
      placeholderTextColor={colors.textMuted}
    />
  )

  if (profile.isLoading || addresses.isLoading) return <LoadingState />

  if (profile.isError) {
    return (
      <Screen title="Account">
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load account"
          message="Your shopper profile could not be loaded. Try again or sign out."
          actionLabel="Retry"
          onAction={() => void profile.refetch()}
        />
        <Button label="Sign out" variant="outline" onPress={() => void logout()} />
      </Screen>
    )
  }

  const email = profile.data?.profile?.email || user?.email || ''
  const addressList = addresses.data?.addresses || []

  return (
    <Screen title="Account" subtitle="Shopper profile" scroll>
      <Card>
        <Text style={type.h2}>Profile</Text>
        {email ? <Text style={styles.muted}>{email}</Text> : null}
        <View style={styles.fields}>
          {field('Name', name, setName)}
          {field('Phone', phone, setPhone)}
          <Button
            label="Save profile"
            loading={update.isPending}
            onPress={() =>
              update.mutate(
                { name: name.trim() || undefined, phone: phone.trim() || undefined },
                {
                  onError: (error) =>
                    Alert.alert('Unable to save', error instanceof Error ? error.message : 'Try again'),
                }
              )
            }
          />
        </View>
      </Card>

      <Card>
        <Text style={type.h2}>Saved addresses</Text>
        {addresses.isError ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Addresses unavailable"
            message="Could not load saved addresses."
            actionLabel="Retry"
            onAction={() => void addresses.refetch()}
          />
        ) : !addressList.length ? (
          <Text style={styles.muted}>No saved addresses yet. Add one below for delivery checkout.</Text>
        ) : (
          addressList.map((address) => (
            <View key={address.id} style={styles.addressRow}>
              <View style={styles.flex}>
                <Text style={styles.address}>
                  {address.label || 'Address'} · {address.address_json.line1}, {address.address_json.city}
                </Text>
                {address.is_default ? <Text style={styles.muted}>Default</Text> : null}
              </View>
              <View style={styles.addressActions}>
                {!address.is_default ? (
                  <Button
                    label="Default"
                    variant="outline"
                    onPress={() => setDefaultAddress.mutate(address.id)}
                  />
                ) : null}
                <Button label="Delete" variant="ghost" onPress={() => deleteAddress.mutate(address.id)} />
              </View>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={type.h2}>Add address</Text>
        <View style={styles.fields}>
          {field('Recipient', recipient, setRecipient)}
          {field('Phone', addressPhone, setAddressPhone)}
          {field('Address line 1', line1, setLine1)}
          {field('City', city, setCity)}
          {field('Country', country, setCountry)}
          <Button
            label="Save address"
            loading={createAddress.isPending}
            onPress={() => {
              if (!line1.trim() || !city.trim() || !country.trim()) {
                Alert.alert('Missing fields', 'Address line, city, and country are required.')
                return
              }
              createAddress.mutate(
                {
                  label: 'Home',
                  recipientName: recipient.trim() || undefined,
                  phone: addressPhone.trim() || undefined,
                  address: { line1: line1.trim(), city: city.trim(), country: country.trim() },
                  isDefault: addressList.length === 0,
                },
                {
                  onError: (error) =>
                    Alert.alert('Unable to save', error instanceof Error ? error.message : 'Try again'),
                }
              )
            }}
          />
        </View>
      </Card>

      <Card>
        <Text style={type.h2}>Account</Text>
        <Button
          label="Delete account"
          variant="danger"
          onPress={() => navigation.navigate('DeleteAccount' as never)}
        />
        <Button label="Sign out" variant="outline" onPress={() => void logout()} />
      </Card>
    </Screen>
  )
}

/** Shown when EXPO_PUBLIC_PUBLIC_SHOP_ENABLED is not true for a CONSUMER session. */
export function ConsumerShopUnavailableScreen() {
  const { logout } = useAuth()
  const navigation = useNavigation<any>()
  return (
    <Screen title="Shop" subtitle="Public catalogs unavailable">
      <EmptyState
        icon="storefront-outline"
        title="Shopping is not available"
        message="Public supplier catalogs are turned off by an admin. You can still manage your account or sign out."
      />
      <View style={styles.unavailableActions}>
        <Button label="Open account" onPress={() => navigation.navigate('Account')} />
        <Button label="Sign out" variant="outline" onPress={() => void logout()} />
      </View>
    </Screen>
  )
}

export function ConsumerNotificationsScreen() {
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ notifications?: unknown[]; items?: unknown[] }>('/api/notifications?limit=50'),
  })
  const rows = query.data?.notifications || query.data?.items || []
  if (query.isLoading) return <LoadingState />
  return (
    <Screen title="Notifications" padded={false}>
      <FlatList
        data={rows as Array<{ id: string | number; title?: string; message?: string }>}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="No notifications"
            message="Order updates will appear here."
          />
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={type.title}>{item.title || 'Order update'}</Text>
            <Text style={styles.muted}>{item.message}</Text>
          </Card>
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  flex: { flex: 1 },
  muted: { ...type.label, marginTop: 4 },
  total: { marginTop: theme.spacing.md, fontSize: 20, fontWeight: '800', color: colors.text },
  fields: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 13,
    color: colors.text,
  },
  address: { paddingVertical: theme.spacing.sm, color: colors.text },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  addressActions: { flexDirection: 'row', gap: theme.spacing.xs },
  unavailableActions: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
})
