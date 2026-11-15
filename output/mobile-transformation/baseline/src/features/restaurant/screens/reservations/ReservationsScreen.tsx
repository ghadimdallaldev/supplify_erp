import { useCallback, useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RestaurantStackParamList } from '../../../../navigation/RestaurantNavigator'
import {
  usePromoteWaitlist,
  useReservationBoard,
  useUpdateReservationStatus,
} from '../../../../services/api/queries'
import { usePermissions } from '../../../../hooks/usePermissions'
import {
  Button,
  EmptyState,
  FlashList,
  ListRow,
  LoadingState,
  Screen,
  SectionHeader,
  StatusPill,
} from '../../../../components/ui'
import type { Reservation, ReservationStatus, ReservationTable, ReservationWaitlist } from '../../../../types/reservations'
import { formatShortDate } from '../../../../utils/format'
import { colors, theme } from '../../../../theme'

type DateFilter = 'today' | 'tomorrow'

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function tableLabel(tableIds: string[], tables: ReservationTable[]): string {
  if (!tableIds.length) return 'Unassigned'
  return tableIds
    .map((id) => tables.find((table) => table.id === id)?.name ?? id.slice(0, 6))
    .join(', ')
}

function reservationSubtitle(reservation: Reservation, tables: ReservationTable[]): string {
  const time = formatShortDate(reservation.scheduled_at)
  const tablesText = tableLabel(reservation.tables, tables)
  return `Party of ${reservation.party_size} · ${time} · ${tablesText}`
}

export function ReservationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const { can, canAny } = usePermissions()
  const canMutate = canAny('RESERVATIONS_CREATE', 'RESERVATIONS_EDIT', 'RESERVATIONS_MANAGE')
  const canCreate = canAny('RESERVATIONS_CREATE', 'RESERVATIONS_EDIT', 'RESERVATIONS_MANAGE')

  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const selectedDate = useMemo(() => {
    const base = new Date()
    if (dateFilter === 'tomorrow') base.setDate(base.getDate() + 1)
    return toIsoDate(base)
  }, [dateFilter])

  const boardQuery = useReservationBoard(selectedDate)
  const updateStatus = useUpdateReservationStatus()
  const promoteWaitlist = usePromoteWaitlist()

  const reservations = boardQuery.data?.reservations ?? []
  const tables = boardQuery.data?.tables ?? []
  const waitlist = boardQuery.data?.waitlist ?? []

  const summary = useMemo(() => {
    const active = reservations.filter((row) => row.status !== 'CANCELLED')
    return {
      total: active.length,
      covers: active.reduce((sum, row) => sum + row.party_size, 0),
      seated: reservations.filter((row) => row.status === 'SEATED').length,
    }
  }, [reservations])

  const applyStatus = useCallback(
    async (id: string, status: ReservationStatus) => {
      try {
        await updateStatus.mutateAsync({ id, status })
      } catch (error) {
        Alert.alert('Could not update', error instanceof Error ? error.message : 'Try again.')
      }
    },
    [updateStatus]
  )

  const openReservationActions = useCallback(
    (reservation: Reservation) => {
      const subtitle = reservationSubtitle(reservation, tables)
      if (!canMutate) {
        Alert.alert(reservation.customer_name, subtitle)
        return
      }

      const buttons: {
        text: string
        style?: 'cancel' | 'destructive' | 'default'
        onPress?: () => void
      }[] = []

      if (reservation.status === 'PENDING') {
        buttons.push({ text: 'Confirm', onPress: () => void applyStatus(reservation.id, 'CONFIRMED') })
        buttons.push({
          text: 'Cancel',
          style: 'destructive',
          onPress: () => void applyStatus(reservation.id, 'CANCELLED'),
        })
      } else if (reservation.status === 'CONFIRMED') {
        buttons.push({ text: 'Seat guest', onPress: () => void applyStatus(reservation.id, 'SEATED') })
        buttons.push({ text: 'No show', onPress: () => void applyStatus(reservation.id, 'NO_SHOW') })
        buttons.push({
          text: 'Cancel',
          style: 'destructive',
          onPress: () => void applyStatus(reservation.id, 'CANCELLED'),
        })
      } else if (reservation.status === 'SEATED') {
        buttons.push({ text: 'Complete', onPress: () => void applyStatus(reservation.id, 'COMPLETED') })
      }

      buttons.push({ text: 'Close', style: 'cancel' })
      Alert.alert(reservation.customer_name, subtitle, buttons)
    },
    [applyStatus, canMutate, tables]
  )

  const handlePromote = useCallback(
    (entry: ReservationWaitlist) => {
      if (!canMutate) return
      Alert.alert(
        'Promote from waitlist',
        `${entry.customer_name} · party of ${entry.party_size}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Promote',
            onPress: () => {
              void promoteWaitlist.mutateAsync(entry.id).catch((error) => {
                Alert.alert('Could not promote', error instanceof Error ? error.message : 'Try again.')
              })
            },
          },
        ]
      )
    },
    [canMutate, promoteWaitlist]
  )

  if (boardQuery.isLoading) return <LoadingState />

  if (!can('RESERVATIONS_VIEW')) {
    return (
      <Screen title="Reservations" scroll>
        <EmptyState icon="calendar-outline" title="Access restricted" message="You do not have permission to view reservations." />
      </Screen>
    )
  }

  return (
    <Screen
      title="Reservations"
      subtitle={`${summary.total} bookings · ${summary.covers} covers · ${summary.seated} seated`}
      padded={false}
      right={
        canCreate ? (
          <Button
            label="New"
            icon="add-outline"
            onPress={() => navigation.navigate('CreateReservation')}
            style={styles.newButton}
          />
        ) : undefined
      }
    >
      <View style={styles.filters}>
        {(['today', 'tomorrow'] as const).map((filter) => (
          <Pressable
            key={filter}
            onPress={() => setDateFilter(filter)}
            style={[styles.filter, dateFilter === filter && styles.filterActive]}
          >
            <Text style={[styles.filterText, dateFilter === filter && styles.filterTextActive]}>
              {filter === 'today' ? 'Today' : 'Tomorrow'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlashList
        data={reservations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={boardQuery.isRefetching} onRefresh={() => void boardQuery.refetch()} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title="No reservations"
            message={`Nothing scheduled for ${dateFilter === 'today' ? 'today' : 'tomorrow'}.`}
          />
        }
        ListFooterComponent={
          waitlist.length ? (
            <View style={styles.waitlistSection}>
              <SectionHeader>Waitlist ({waitlist.length})</SectionHeader>
              {waitlist.map((entry) => (
                <ListRow
                  key={entry.id}
                  icon="hourglass-outline"
                  iconTone="warning"
                  title={entry.customer_name}
                  subtitle={`Party of ${entry.party_size} · ${formatShortDate(entry.requested_at)}`}
                  right={
                    canMutate ? (
                      <Button
                        label="Promote"
                        variant="outline"
                        onPress={() => handlePromote(entry)}
                        style={styles.promoteButton}
                      />
                    ) : (
                      <StatusPill status={entry.status} />
                    )
                  }
                  style={styles.row}
                />
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <ListRow
            icon="people-outline"
            iconTone={item.status === 'SEATED' ? 'success' : item.status === 'CANCELLED' ? 'danger' : 'info'}
            title={item.customer_name}
            subtitle={reservationSubtitle(item, tables)}
            right={<StatusPill status={item.status} />}
            onPress={() => openReservationActions(item)}
            style={styles.row}
          />
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  newButton: { minHeight: 40, paddingHorizontal: theme.spacing.md },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  filter: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  filterActive: { backgroundColor: colors.brand },
  filterText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: colors.onBrand },
  list: { padding: theme.spacing.md, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.xxl },
  row: { marginBottom: theme.spacing.sm },
  waitlistSection: { marginTop: theme.spacing.md },
  promoteButton: { minHeight: 36, paddingHorizontal: theme.spacing.sm },
})
