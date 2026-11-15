import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../auth/AuthContext'
import {
  useCancelDispute,
  useDispute,
  useRejectDispute,
  useResolveDispute,
  useReviewDispute,
} from '../../services/api/queries'
import {
  disputeCreatedAt,
  disputeCreditNoteAmount,
  disputeCreditNoteLabel,
  disputeDisputedAmount,
  disputeItemIssue,
  disputeItemProductName,
  disputeItemQuantityOrdered,
  disputeItemQuantityReceived,
  disputeOrderId,
  disputePartyName,
  disputeResolutionNotes,
  disputeType,
  RESOLUTION_TYPES,
  type ResolutionType,
} from '../../types/disputes'
import { usePermissions } from '../../hooks/usePermissions'
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  SectionHeader,
  StatusPill,
} from '../../components/ui'
import { formatDay, formatMoney } from '../../utils/format'
import { colors, theme, type } from '../../theme'

type DisputeDetailParams = { DisputeDetail: { disputeId: string } }

function prettyLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function DisputeDetailScreen() {
  const { params } = useRoute<RouteProp<DisputeDetailParams, 'DisputeDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>()
  const { user } = useAuth()
  const { can } = usePermissions()
  const isSupplier = user?.role === 'SUPPLIER'
  const canManageSupplierDisputes = can('FULFILLMENT_MANAGE')
  // Credit-note / refund resolutions move money: API requires INVOICES_MANAGE (Owner, Accountant).
  const canResolveWithMoney = can('INVOICES_MANAGE')
  const resolutionOptions = RESOLUTION_TYPES.filter(
    (option) => canResolveWithMoney || (option !== 'credit_note' && option !== 'refund')
  )

  const { data, isLoading, isError, refetch } = useDispute(params.disputeId)
  const reviewDispute = useReviewDispute()
  const resolveDispute = useResolveDispute()
  const rejectDispute = useRejectDispute()
  const cancelDispute = useCancelDispute()

  const [showResolve, setShowResolve] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [resolutionType, setResolutionType] = useState<ResolutionType>(canResolveWithMoney ? 'credit_note' : 'replacement')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReference, setRefundReference] = useState('')

  if (isLoading) return <LoadingState />

  if (isError || !data?.dispute) {
    return (
      <Screen title="Dispute" scroll>
        <EmptyState
          icon="cloud-offline-outline"
          title="Dispute not found"
          message="This dispute could not be loaded."
        />
      </Screen>
    )
  }

  const dispute = data.dispute
  const items = data.items ?? []
  const creditNotes = data.creditNotes ?? []
  const status = dispute.status
  const orderId = disputeOrderId(dispute)
  const replacementOrderId =
    dispute.replacementOrderId ??
    dispute.replacement_order_id ??
    data.replacementOrder?.id ??
    ''
  const disputedAmount = disputeDisputedAmount(dispute)
  const resolutionText = disputeResolutionNotes(dispute)

  const handleReview = async () => {
    try {
      await reviewDispute.mutateAsync(params.disputeId)
      Alert.alert('Updated', 'Dispute marked under review.')
      void refetch()
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Try again.')
    }
  }

  const handleResolve = async () => {
    try {
      await resolveDispute.mutateAsync({
        id: params.disputeId,
        body: {
          resolutionType,
          resolutionNotes: resolutionNotes.trim() || undefined,
          creditNoteAmount: creditAmount.trim() ? Number(creditAmount) : undefined,
          refundAmount: refundAmount.trim() ? Number(refundAmount) : undefined,
          refundReference: refundReference.trim() || undefined,
        },
      })
      Alert.alert('Resolved', 'Dispute has been resolved.')
      setShowResolve(false)
      setResolutionNotes('')
      setCreditAmount('')
      setRefundAmount('')
      setRefundReference('')
      void refetch()
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Try again.')
    }
  }

  const handleReject = async () => {
    if (!resolutionNotes.trim()) {
      Alert.alert('Notes required', 'Please explain why the dispute is rejected.')
      return
    }
    try {
      await rejectDispute.mutateAsync({
        id: params.disputeId,
        resolutionNotes: resolutionNotes.trim(),
      })
      Alert.alert('Rejected', 'Dispute has been rejected.')
      setShowReject(false)
      setResolutionNotes('')
      void refetch()
    } catch (error) {
      Alert.alert('Failed', error instanceof Error ? error.message : 'Try again.')
    }
  }

  const handleCancel = async () => {
    Alert.alert('Cancel dispute?', 'This cannot be undone.', [
      { text: 'Keep open', style: 'cancel' },
      {
        text: 'Cancel dispute',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await cancelDispute.mutateAsync(params.disputeId)
              Alert.alert('Cancelled', 'Dispute was cancelled.')
              void refetch()
            } catch (error) {
              Alert.alert('Failed', error instanceof Error ? error.message : 'Try again.')
            }
          })()
        },
      },
    ])
  }

  return (
    <Screen
      title="Dispute details"
      subtitle={`${prettyLabel(disputeType(dispute))} · ${prettyLabel(status)}`}
      scroll
      right={<StatusPill status={status} />}
    >
      {data.resolutionEffect ? (
        <Card style={styles.banner}>
          <Text style={type.title}>Resolution effect</Text>
          <Text style={styles.meta}>{prettyLabel(data.resolutionEffect.effect_type ?? data.resolutionEffect.effectType ?? 'resolution')} {data.resolutionEffect.amount != null ? `· ${formatMoney(Number(data.resolutionEffect.amount))}` : ''}</Text>
          {data.resolutionEffect.reference ? <Text style={styles.meta}>Reference: {data.resolutionEffect.reference}</Text> : null}
        </Card>
      ) : null}
      {replacementOrderId ? (
        <Card style={styles.banner}>
          <Text style={type.title}>Replacement order</Text>
          <Text style={styles.meta}>A replacement order was created for this dispute.</Text>
          <Button
            label={`View order ${replacementOrderId.slice(0, 8)}`}
            variant="outline"
            icon="receipt-outline"
            onPress={() => navigation.navigate('OrderDetail', { orderId: replacementOrderId })}
            style={styles.action}
          />
        </Card>
      ) : null}

      <SectionHeader>Summary</SectionHeader>
      <Card>
        <SummaryRow label="Status" value={prettyLabel(status)} />
        <SummaryRow
          label="Order"
          value={orderId ? `#${orderId.slice(0, 8)}` : '—'}
          onPress={orderId ? () => navigation.navigate('OrderDetail', { orderId }) : undefined}
        />
        <SummaryRow
          label={isSupplier ? 'Restaurant' : 'Supplier'}
          value={disputePartyName(dispute, isSupplier ? 'SUPPLIER' : 'RESTAURANT')}
        />
        {disputedAmount != null && disputedAmount > 0 ? (
          <SummaryRow label="Disputed amount" value={formatMoney(disputedAmount)} />
        ) : null}
        {dispute.orderStatus ?? dispute.order_status ? (
          <SummaryRow
            label="Order status"
            value={prettyLabel(String(dispute.orderStatus ?? dispute.order_status))}
          />
        ) : null}
        {disputeCreatedAt(dispute) ? (
          <SummaryRow label="Opened" value={formatDay(disputeCreatedAt(dispute))} />
        ) : null}
      </Card>

      <SectionHeader>Description</SectionHeader>
      <Card>
        <Text style={styles.body}>{dispute.description?.trim() || '—'}</Text>
        {resolutionText ? (
          <>
            <Text style={styles.sectionLabel}>Resolution notes</Text>
            <Text style={styles.body}>{resolutionText}</Text>
          </>
        ) : null}
      </Card>

      {items.length ? (
        <>
          <SectionHeader>Line items</SectionHeader>
          {items.map((item) => (
            <Card key={item.id} style={styles.itemCard}>
              <Text style={type.title}>{disputeItemProductName(item)}</Text>
              <Text style={styles.meta}>
                Ordered {disputeItemQuantityOrdered(item)} · Received{' '}
                {disputeItemQuantityReceived(item)}
              </Text>
              <Text style={styles.meta}>{disputeItemIssue(item)}</Text>
            </Card>
          ))}
        </>
      ) : null}

      {creditNotes.length ? (
        <>
          <SectionHeader>Credit notes</SectionHeader>
          {creditNotes.map((note) => (
            <Card key={note.id} style={styles.itemCard}>
              <View style={styles.creditRow}>
                <Text style={type.title}>{disputeCreditNoteLabel(note)}</Text>
                <Text style={styles.amount}>{formatMoney(disputeCreditNoteAmount(note))}</Text>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {isSupplier && canManageSupplierDisputes && status === 'open' ? (
        <Button
          label="Mark under review"
          variant="outline"
          icon="eye-outline"
          onPress={() => void handleReview()}
          loading={reviewDispute.isPending}
          disabled={reviewDispute.isPending}
          style={styles.action}
        />
      ) : null}

      {isSupplier &&
      canManageSupplierDisputes &&
      (status === 'open' || status === 'under_review') ? (
        <>
          {!showResolve ? (
            <Button
              label="Resolve dispute"
              icon="checkmark-circle-outline"
              onPress={() => {
                setShowReject(false)
                setShowResolve(true)
              }}
              style={styles.action}
            />
          ) : (
            <Card style={styles.formCard}>
              <Text style={type.title}>Resolve dispute</Text>
              <Text style={styles.meta}>Choose how you will resolve this dispute.</Text>
              <View style={styles.chips}>
                {resolutionOptions.map((option) => {
                  const active = option === resolutionType
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setResolutionType(option)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {prettyLabel(option)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              {resolutionType === 'refund' ? (
                <>
                  <TextInput style={styles.input} placeholder="Refund amount" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" value={refundAmount} onChangeText={setRefundAmount} />
                  <TextInput style={styles.input} placeholder="Refund reference (required)" placeholderTextColor={colors.textFaint} value={refundReference} onChangeText={setRefundReference} />
                </>
              ) : null}
              {resolutionType === 'credit_note' ? (
                <TextInput
                  style={styles.input}
                  placeholder="Credit amount"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                  value={creditAmount}
                  onChangeText={setCreditAmount}
                />
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Resolution notes (optional)"
                placeholderTextColor={colors.textFaint}
                multiline
                numberOfLines={3}
                value={resolutionNotes}
                onChangeText={setResolutionNotes}
                textAlignVertical="top"
              />
              <View style={styles.formActions}>
                <Button
                  label="Confirm resolve"
                  onPress={() => void handleResolve()}
                  loading={resolveDispute.isPending}
                  disabled={resolveDispute.isPending}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setShowResolve(false)}
                  style={styles.formSecondary}
                />
              </View>
            </Card>
          )}

          {!showReject ? (
            <Button
              label="Reject dispute"
              variant="outline"
              icon="close-circle-outline"
              onPress={() => {
                setShowResolve(false)
                setShowReject(true)
              }}
              style={styles.action}
            />
          ) : (
            <Card style={styles.formCard}>
              <Text style={type.title}>Reject dispute</Text>
              <Text style={styles.meta}>Explain why this dispute is rejected.</Text>
              <TextInput
                style={styles.input}
                placeholder="Rejection notes (required)"
                placeholderTextColor={colors.textFaint}
                multiline
                numberOfLines={4}
                value={resolutionNotes}
                onChangeText={setResolutionNotes}
                textAlignVertical="top"
              />
              <View style={styles.formActions}>
                <Button
                  label="Confirm reject"
                  variant="danger"
                  onPress={() => void handleReject()}
                  loading={rejectDispute.isPending}
                  disabled={rejectDispute.isPending}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setShowReject(false)}
                  style={styles.formSecondary}
                />
              </View>
            </Card>
          )}
        </>
      ) : null}

      {!isSupplier && can('ORDERS_CREATE') && status === 'open' ? (
        <Button
          label="Cancel dispute"
          variant="outline"
          icon="trash-outline"
          onPress={() => void handleCancel()}
          loading={cancelDispute.isPending}
          disabled={cancelDispute.isPending}
          style={styles.action}
        />
      ) : null}
    </Screen>
  )
}

function SummaryRow({
  label,
  value,
  onPress,
}: {
  label: string
  value: string
  onPress?: () => void
}) {
  const content = (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, onPress ? styles.link : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
  if (!onPress) return content
  return <Pressable onPress={onPress}>{content}</Pressable>
}

const styles = StyleSheet.create({
  banner: { marginBottom: theme.spacing.sm, backgroundColor: colors.infoBg },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: 6,
  },
  summaryLabel: { ...type.label, flex: 1 },
  summaryValue: { ...type.body, flex: 1, textAlign: 'right' },
  link: { color: colors.brand, fontWeight: '700' },
  meta: { ...type.label, marginTop: 4 },
  body: { ...type.body, lineHeight: 22 },
  sectionLabel: { ...type.caption, marginTop: theme.spacing.md, marginBottom: 4 },
  itemCard: { marginBottom: theme.spacing.xs },
  creditRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontWeight: '800', color: colors.text },
  action: { marginTop: theme.spacing.md },
  formCard: { marginTop: theme.spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  chipText: { ...type.label, color: colors.text },
  chipTextActive: { color: colors.brandDark },
  input: {
    minHeight: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    fontSize: 15,
    color: colors.text,
    marginTop: theme.spacing.sm,
  },
  formActions: { marginTop: theme.spacing.md, gap: theme.spacing.xs },
  formSecondary: { marginTop: theme.spacing.xs },
})
