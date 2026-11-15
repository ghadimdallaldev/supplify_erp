import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import * as Location from 'expo-location'
import { Button, Card, EmptyState, LoadingState, Screen, StatusPill } from '../../components/ui'
import { useAuth } from '../auth/AuthContext'
import { colors, theme, type } from '../../theme'
import { webAppUrl } from '../../utils/webAppUrl'
import {
  useConsumerAddresses,
  useGuestPublicOrder,
  usePlacePublicOrder,
  usePreviewPublicOrder,
  usePublicSupplier,
} from './api'
import { saveGuestOrder } from './guestOrders'
import { usePublicCart } from './store'
import type { PublicAddress, PublicFulfillmentMethod, PublicOrder, PublicPaymentMethod } from './types'
import { ApiError } from '../../services/api/client'

const money = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)

function Field({ value, onChangeText, placeholder, keyboardType = 'default' }: { value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' }) {
  return <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} style={styles.input} />
}

export function PublicCheckoutScreen() {
  const navigation = useNavigation<any>()
  const { user } = useAuth()
  const lines = usePublicCart((state) => state.lines)
  const storefront = usePublicCart((state) => state.storefront) || ''
  const clear = usePublicCart((state) => state.clear)
  const supplier = usePublicSupplier(storefront)
  const savedAddresses = useConsumerAddresses(user?.role === 'CONSUMER')
  const sales = supplier.data?.salesLocations?.find((entry) => entry.supplierId === lines[0]?.supplierLocationId) || supplier.data?.salesLocations?.[0]
  const [fulfillmentMethod, setFulfillmentMethod] = useState<PublicFulfillmentMethod>('DELIVERY')
  const compatible = useMemo(() => (sales?.paymentMethods || []).filter((method) => fulfillmentMethod === 'DELIVERY' ? method !== 'CASH_ON_PICKUP' : method !== 'CASH_ON_DELIVERY'), [sales, fulfillmentMethod])
  const [paymentMethod, setPaymentMethod] = useState<PublicPaymentMethod>('CASH_ON_DELIVERY')
  useEffect(() => {
    if (sales && fulfillmentMethod === 'DELIVERY' && !sales.deliveryEnabled) setFulfillmentMethod('PICKUP')
  }, [sales, fulfillmentMethod])
  useEffect(() => {
    if (compatible.length && !compatible.includes(paymentMethod)) setPaymentMethod(compatible[0])
  }, [compatible, paymentMethod])
  const [name, setName] = useState(user?.displayName || '')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(user?.email || '')
  const [whatsappConsent, setWhatsappConsent] = useState(false)
  const [address, setAddress] = useState<PublicAddress>({ line1: '', city: '', country: '' })
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const preview = usePreviewPublicOrder(storefront)
  const place = usePlacePublicOrder(storefront, user?.role === 'CONSUMER')
  const idempotencyKey = useRef<string | null>(null)
  const attemptFingerprint = useRef<string | null>(null)
  const payload = {
    items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    fulfillmentMethod,
    ...(fulfillmentMethod === 'DELIVERY' ? { deliveryAddress: address } : {}),
    paymentMethod,
  }
  const checkoutFingerprint = JSON.stringify(payload)
  useEffect(() => {
    preview.reset()
  }, [checkoutFingerprint])
  useEffect(() => {
    if (selectedAddressId || !savedAddresses.data?.addresses.length) return
    const saved =
      savedAddresses.data.addresses.find((entry) => entry.is_default) ||
      savedAddresses.data.addresses[0]
    setSelectedAddressId(saved.id)
    setAddress({ ...saved.address_json, ...(saved.coords || {}) })
    setName((current) => current || saved.recipient_name)
    setPhone((current) => current || saved.phone)
  }, [savedAddresses.data, selectedAddressId])

  if (!lines.length) return <Screen title="Checkout"><EmptyState icon="cart-outline" title="Cart is empty" message="Return to a catalog to add products." /></Screen>

  const submit = async () => {
    if (!preview.data) return
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Missing contact', 'Name and phone are required.')
      return
    }
    const placementFingerprint = JSON.stringify({
      ...payload,
      customer: {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        whatsappConsent,
      },
    })
    if (!idempotencyKey.current || attemptFingerprint.current !== placementFingerprint) {
      idempotencyKey.current = Crypto.randomUUID()
      attemptFingerprint.current = placementFingerprint
    }
    try {
      const result = await place.mutateAsync({
        payload: {
          ...payload,
          customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, whatsappConsent },
        },
        idempotencyKey: idempotencyKey.current,
      })
      if (result.trackingToken) {
        await saveGuestOrder({ token: result.trackingToken, reference: result.order.reference, supplierName: result.order.supplierName, createdAt: result.order.createdAt })
      }
      clear()
      setName('')
      setPhone('')
      setEmail('')
      setAddress({ line1: '', city: '', country: '' })
      idempotencyKey.current = null
      attemptFingerprint.current = null
      navigation.replace('Receipt', { token: result.trackingToken || undefined, order: result.order })
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 409) {
        idempotencyKey.current = null
        attemptFingerprint.current = null
      }
      Alert.alert('Could not place order', error instanceof Error ? error.message : 'Try again.')
    }
  }

  return (
    <Screen title="Checkout" scroll>
      <Card>
        <Text style={type.title}>Fulfillment</Text>
        <View style={styles.choiceRow}>
          {sales?.deliveryEnabled ? <Button label="Delivery" variant={fulfillmentMethod === 'DELIVERY' ? 'primary' : 'outline'} onPress={() => { setFulfillmentMethod('DELIVERY'); preview.reset() }} /> : null}
          {sales?.pickupEnabled ? <Button label="Pickup" variant={fulfillmentMethod === 'PICKUP' ? 'primary' : 'outline'} onPress={() => { setFulfillmentMethod('PICKUP'); preview.reset() }} /> : null}
        </View>
        {fulfillmentMethod === 'DELIVERY' ? (
          <View style={styles.fields}>
            {savedAddresses.data?.addresses.length ? (
              <View style={styles.fields}>
                <Text style={type.label}>Saved addresses</Text>
                <View style={styles.choiceRow}>
                  {savedAddresses.data.addresses.map((saved) => (
                    <Button
                      key={saved.id}
                      label={saved.label || saved.address_json.line1}
                      variant={selectedAddressId === saved.id ? 'primary' : 'outline'}
                      onPress={() => {
                        setSelectedAddressId(saved.id)
                        setAddress({ ...saved.address_json, ...(saved.coords || {}) })
                        setName(saved.recipient_name)
                        setPhone(saved.phone)
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <Field placeholder="Address line 1" value={address.line1} onChangeText={(line1) => setAddress({ ...address, line1 })} />
            <Field placeholder="City" value={address.city} onChangeText={(city) => setAddress({ ...address, city })} />
            <Field placeholder="Region" value={address.region || ''} onChangeText={(region) => setAddress({ ...address, region })} />
            <Field placeholder="Postal code" value={address.postalCode || ''} onChangeText={(postalCode) => setAddress({ ...address, postalCode })} />
            <Field placeholder="Country" value={address.country} onChangeText={(country) => setAddress({ ...address, country })} />
            <Button label={address.lat != null ? 'Current location added' : 'Use current location'} variant="outline" onPress={() => void (async () => {
              const permission = await Location.requestForegroundPermissionsAsync()
              if (!permission.granted) {
                Alert.alert('Location required', 'Allow location access or enter a delivery-zone postal code.')
                return
              }
              const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              setAddress({ ...address, lat: current.coords.latitude, lng: current.coords.longitude })
            })()} />
          </View>
        ) : null}
      </Card>
      <Card>
        <Text style={type.title}>Offline payment</Text>
        <View style={styles.choiceRow}>{compatible.map((method) => <Button key={method} label={method.replace(/_/g, ' ')} variant={paymentMethod === method ? 'primary' : 'outline'} onPress={() => { setPaymentMethod(method); preview.reset() }} />)}</View>
      </Card>
      <Card>
        <Text style={type.title}>Contact</Text>
        <View style={styles.fields}>
          <Field placeholder="Full name" value={name} onChangeText={setName} />
          <Field placeholder="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field placeholder="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <View style={styles.switchRow}><Text style={styles.flex}>WhatsApp updates when available</Text><Switch value={whatsappConsent} onValueChange={setWhatsappConsent} /></View>
        </View>
      </Card>
      {preview.data ? (
        <Card>
          <Text style={type.h2}>Final summary</Text>
          <View style={styles.summary}><Text>Subtotal</Text><Text>{money(preview.data.subtotal, preview.data.currency)}</Text></View>
          <View style={styles.summary}><Text>Delivery fee</Text><Text>{money(preview.data.deliveryFee, preview.data.currency)}</Text></View>
          <View style={styles.summary}><Text style={type.title}>Total</Text><Text style={type.title}>{money(preview.data.total, preview.data.currency)}</Text></View>
          {preview.data.bankTransferInstructions ? <Text style={styles.instructions}>{preview.data.bankTransferInstructions}</Text> : null}
        </Card>
      ) : null}
      <Button label={preview.data ? 'Refresh total' : 'Review total'} disabled={compatible.length === 0} loading={preview.isPending} onPress={() => preview.mutate(payload, { onError: (error) => Alert.alert('Checkout unavailable', error.message) })} />
      {preview.data ? (
        <>
          <Text style={styles.privacyNote}>
            By placing an order you agree to our Privacy Policy. Guest checkout contact details are used only to fulfill and track this order.
          </Text>
          <Pressable onPress={() => void Linking.openURL(webAppUrl('/legal/privacy_policy'))}>
            <Text style={styles.privacyLink}>View Privacy Policy</Text>
          </Pressable>
          <Button label="Place order" loading={place.isPending} onPress={() => void submit()} />
        </>
      ) : null}
    </Screen>
  )
}

function Receipt({ order }: { order: PublicOrder }) {
  const status = order.fulfillmentMethod === 'PICKUP' && order.status === 'SHIPPED' ? 'READY FOR PICKUP' : order.fulfillmentMethod === 'PICKUP' && order.status === 'DELIVERED' ? 'PICKED UP' : order.status === 'PLACED' ? 'PENDING CONFIRMATION' : order.status
  return (
    <View style={styles.fields}>
      <Card>
        <Text style={type.h1}>{order.reference}</Text>
        <Text style={styles.muted}>{order.supplierName}</Text>
        <StatusPill status={status} domain="order" />
        <View style={styles.summary}><Text>Total</Text><Text style={type.title}>{money(order.total, order.currency)}</Text></View>
        <Text style={styles.muted}>{order.fulfillmentMethod} · {order.paymentMethod.replace(/_/g, ' ')}</Text>
      </Card>
      {order.items?.map((item) => <Card key={item.productId}><Text style={type.title}>{item.name}</Text><Text style={styles.muted}>{item.quantity} × {money(item.unitPrice, order.currency)}</Text></Card>)}
    </View>
  )
}

export function PublicReceiptScreen() {
  const navigation = useNavigation<any>()
  const { user, register } = useAuth()
  const route = useRoute<any>()
  const token = String(route.params?.token || '')
  const supplied = route.params?.order as PublicOrder | undefined
  const query = useGuestPublicOrder(token)
  const order = query.data || supplied
  return (
    <Screen title="Receipt" scroll>
      {token && query.isLoading && !order ? <LoadingState /> : order ? <Receipt order={order} /> : <EmptyState icon="alert-circle-outline" title="Order unavailable" message="This tracking link may be invalid or revoked." />}
      <Button label="Continue shopping" variant="outline" onPress={() => navigation.navigate('Discover')} />
      {!user && order?.customerType === 'GUEST' ? <Button label="Create account" onPress={() => void register()} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: theme.radius.md, backgroundColor: colors.surface, paddingHorizontal: 13, color: colors.text },
  fields: { gap: theme.spacing.sm },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  flex: { flex: 1, color: colors.text },
  summary: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, marginTop: theme.spacing.sm },
  instructions: { marginTop: theme.spacing.md, color: colors.textMuted },
  muted: { ...type.label, marginVertical: theme.spacing.sm },
  privacyNote: { ...type.label, color: colors.textMuted, marginTop: theme.spacing.sm },
  privacyLink: { color: colors.brand, fontWeight: '600', textDecorationLine: 'underline', marginVertical: theme.spacing.sm },
})
