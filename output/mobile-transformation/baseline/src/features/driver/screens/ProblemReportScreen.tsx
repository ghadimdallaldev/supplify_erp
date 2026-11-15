import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import type { DriverStackParamList } from '../../../navigation/DriverNavigator'
import { useUpdateDeliveryStatus } from '../../../services/api/queries'
import { Button, Card, Screen, SectionHeader } from '../../../components/ui'
import { PROBLEM_REASONS } from '../../../utils/driverDeliveryUi'
import { colors, theme, type } from '../../../theme'

export function ProblemReportScreen() {
  const { params } = useRoute<RouteProp<DriverStackParamList, 'ProblemReport'>>()
  const navigation = useNavigation()
  const [reason, setReason] = useState<string>(PROBLEM_REASONS[0])
  const [note, setNote] = useState('')
  const updateStatus = useUpdateDeliveryStatus()

  const send = async () => {
    try {
      await updateStatus.mutateAsync({
        orderId: params.orderId,
        status: 'failed',
        failure_reason: note.trim() ? `${reason}: ${note.trim()}` : reason,
        driver_assignment_id: params.driverAssignmentId,
        warehouse_assignment_id: params.warehouseAssignmentId,
      })
      Alert.alert('Sent', 'Problem reported.')
      navigation.goBack()
      navigation.goBack()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not send problem')
    }
  }

  return (
    <Screen title="Report problem" subtitle={params.restaurantName} scroll>
      <SectionHeader>What went wrong?</SectionHeader>
      <Card>
        {PROBLEM_REASONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            style={[styles.reason, reason === r && styles.reasonActive]}
          >
            <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
          </Pressable>
        ))}
      </Card>

      <SectionHeader>Additional details</SectionHeader>
      <Card>
        <TextInput
          placeholder="Add a note (optional)"
          value={note}
          onChangeText={setNote}
          style={styles.input}
          multiline
          placeholderTextColor={colors.textFaint}
        />
      </Card>

      <Button
        label={updateStatus.isPending ? 'Sending…' : 'Send problem report'}
        variant="danger"
        icon="alert-circle-outline"
        onPress={send}
        disabled={updateStatus.isPending}
        loading={updateStatus.isPending}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  reason: {
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  reasonActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  reasonText: { fontSize: 16, color: colors.text, fontWeight: '500' },
  reasonTextActive: { color: colors.brandDark, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    minHeight: 96,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
})
