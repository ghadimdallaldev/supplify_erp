import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useCreateDispute, useOrder } from '../../../services/api/queries'
import { DISPUTE_TYPES } from '../../../types/disputes'
import {
  Button,
  LoadingState,
  Screen,
  SectionHeader,
  ToastBanner,
} from '../../../components/ui'
import {
  disputeEligibilityMessage,
  isOrderEligibleForDispute,
} from '../../../utils/orderDisputeEligibility'
import { colors, theme, type } from '../../../theme'

type OrderItemWithSupplier = { supplier_id?: string }

function prettyDisputeType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function CreateDisputeScreen() {
  const { params } = useRoute()
  const navigation = useNavigation()
  const orderId = (params as { orderId: string }).orderId

  const { data: order, isLoading, isError } = useOrder(orderId)
  const createDispute = useCreateDispute()

  const [disputeType, setDisputeType] = useState<string>(DISPUTE_TYPES[0])
  const [description, setDescription] = useState('')

  if (isLoading) return <LoadingState />
  if (isError || !order?.id) {
    return (
      <Screen title="Open dispute" scroll>
        <ToastBanner message="This order could not be loaded." tone="error" />
      </Screen>
    )
  }

  const eligible = isOrderEligibleForDispute(order.status)
  const eligibilityMsg = disputeEligibilityMessage(order.status)
  const supplierId = (order.items?.[0] as OrderItemWithSupplier | undefined)?.supplier_id ?? ''

  const submit = async () => {
    if (!eligible) {
      Alert.alert('Not eligible', eligibilityMsg)
      return
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Please describe the issue.')
      return
    }
    if (!supplierId) {
      Alert.alert('Missing supplier', 'Could not determine supplier for this order.')
      return
    }
    try {
      await createDispute.mutateAsync({
        order_id: orderId,
        supplier_id: supplierId,
        dispute_type: disputeType,
        description: description.trim(),
      })
      Alert.alert('Dispute opened', 'Your dispute was submitted.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Try again')
    }
  }

  return (
    <Screen title="Open dispute" subtitle={`Order ${orderId.slice(0, 8)}`} scroll>
      {!eligible ? <ToastBanner message={eligibilityMsg} tone="error" /> : null}

      <SectionHeader>Dispute type</SectionHeader>
      <View style={styles.types}>
        {DISPUTE_TYPES.map((t) => {
          const active = t === disputeType
          return (
            <Pressable
              key={t}
              onPress={() => setDisputeType(t)}
              disabled={!eligible}
              style={[styles.typeChip, active && styles.typeChipActive, !eligible && styles.disabled]}
            >
              <Text style={[styles.typeText, active && styles.typeTextActive]}>{prettyDisputeType(t)}</Text>
            </Pressable>
          )
        })}
      </View>

      <SectionHeader>Description</SectionHeader>
      <TextInput
        style={styles.input}
        multiline
        numberOfLines={5}
        placeholder="Describe what went wrong…"
        placeholderTextColor={colors.textFaint}
        value={description}
        onChangeText={setDescription}
        editable={eligible}
        textAlignVertical="top"
      />

      <Button
        label={createDispute.isPending ? 'Submitting…' : 'Submit dispute'}
        icon="shield-outline"
        onPress={() => void submit()}
        disabled={!eligible || createDispute.isPending}
        loading={createDispute.isPending}
        style={styles.submit}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  typeText: { ...type.label, color: colors.text },
  typeTextActive: { color: colors.brandDark },
  disabled: { opacity: 0.5 },
  input: {
    minHeight: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    fontSize: 15,
    color: colors.text,
    marginBottom: theme.spacing.lg,
  },
  submit: { marginTop: theme.spacing.sm },
})
