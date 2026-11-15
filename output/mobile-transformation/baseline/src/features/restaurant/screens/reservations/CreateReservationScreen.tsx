import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RestaurantStackParamList } from '../../../../navigation/RestaurantNavigator'
import { useCreateReservation } from '../../../../services/api/queries'
import { usePermissions } from '../../../../hooks/usePermissions'
import { Button, EmptyState, Screen, SectionHeader } from '../../../../components/ui'
import { colors, theme, type } from '../../../../theme'

const DEFAULT_DURATION = 90

function defaultScheduledAt(): string {
  const date = new Date()
  date.setHours(date.getHours() + 1, 0, 0, 0)
  return date.toISOString()
}

function formatDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function CreateReservationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const { canAny } = usePermissions()
  const canCreate = canAny('RESERVATIONS_CREATE', 'RESERVATIONS_EDIT', 'RESERVATIONS_MANAGE')
  const createReservation = useCreateReservation()

  const initialScheduled = useMemo(() => defaultScheduledAt(), [])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [partySize, setPartySize] = useState('2')
  const [scheduledInput, setScheduledInput] = useState(formatDatetimeLocal(initialScheduled))
  const [durationMinutes, setDurationMinutes] = useState(String(DEFAULT_DURATION))
  const [notes, setNotes] = useState('')

  if (!canCreate) {
    return (
      <Screen title="New reservation" scroll>
        <EmptyState
          icon="calendar-outline"
          title="Access restricted"
          message="You do not have permission to create reservations."
        />
        <Button label="Go back" variant="outline" onPress={() => navigation.goBack()} />
      </Screen>
    )
  }

  const submit = async () => {
    const name = customerName.trim()
    if (!name) {
      Alert.alert('Guest name required', 'Enter the guest name before saving.')
      return
    }

    const size = Number(partySize)
    if (!Number.isFinite(size) || size < 1) {
      Alert.alert('Check party size', 'Party size must be at least 1.')
      return
    }

    const duration = Number(durationMinutes)
    if (!Number.isFinite(duration) || duration < 30) {
      Alert.alert('Check duration', 'Duration must be at least 30 minutes.')
      return
    }

    const scheduledAt = new Date(scheduledInput.includes('T') ? scheduledInput : `${scheduledInput}:00`)
    if (Number.isNaN(scheduledAt.getTime())) {
      Alert.alert('Check date and time', 'Use YYYY-MM-DDTHH:mm format.')
      return
    }

    try {
      await createReservation.mutateAsync({
        customerName: name,
        customerPhone: customerPhone.trim() || undefined,
        partySize: size,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: duration,
        notes: notes.trim() || undefined,
        bookingSource: 'staff',
      })
      navigation.goBack()
    } catch (error) {
      Alert.alert('Could not create reservation', error instanceof Error ? error.message : 'Try again.')
    }
  }

  return (
    <Screen title="New reservation" subtitle="Host desk booking" scroll>
      <SectionHeader>Guest</SectionHeader>
      <View style={styles.field}>
        <Text style={type.label}>Name</Text>
        <TextInput
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="Guest name"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCapitalize="words"
        />
      </View>
      <View style={styles.field}>
        <Text style={type.label}>Phone</Text>
        <TextInput
          value={customerPhone}
          onChangeText={setCustomerPhone}
          placeholder="Optional"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          keyboardType="phone-pad"
        />
      </View>

      <SectionHeader>Booking</SectionHeader>
      <View style={styles.field}>
        <Text style={type.label}>Party size</Text>
        <TextInput
          value={partySize}
          onChangeText={setPartySize}
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <Text style={type.label}>Date & time (YYYY-MM-DDTHH:mm)</Text>
        <TextInput
          value={scheduledInput}
          onChangeText={setScheduledInput}
          placeholder="2026-09-12T19:00"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCapitalize="none"
        />
      </View>
      <View style={styles.field}>
        <Text style={type.label}>Duration (minutes)</Text>
        <TextInput
          value={durationMinutes}
          onChangeText={setDurationMinutes}
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <Text style={type.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Allergies, occasion, seating preference…"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.notes]}
          multiline
        />
      </View>

      <Button
        label="Create reservation"
        icon="checkmark-outline"
        loading={createReservation.isPending}
        onPress={() => void submit()}
        style={styles.submit}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  field: { marginBottom: theme.spacing.md },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  notes: { minHeight: 88, textAlignVertical: 'top' },
  submit: { marginTop: theme.spacing.sm },
})
