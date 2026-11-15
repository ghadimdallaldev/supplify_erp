import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../../auth/AuthContext'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../../services/api/queries'
import { openNotificationTarget, resolveNotificationTarget } from '../../../navigation/notificationNavigation'
import {
  Button,
  EmptyState,
  ErrorState,
  FlashList,
  ListRow,
  LoadingState,
  Screen,
} from '../../../components/ui'
import { formatShortDate } from '../../../utils/format'
import { colors, theme } from '../../../theme'

export function NotificationsScreen() {
  const { user } = useAuth()
  const navigation = useNavigation<any>()
  const query = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const unread = (query.data ?? []).filter((item) => !item.read).length

  if (query.isLoading && !query.data) return <LoadingState />

  const open = (item: NonNullable<typeof query.data>[number]) => {
    if (!item.read) markRead.mutate(item.id)
    const target = resolveNotificationTarget(user, item as typeof item & Record<string, unknown>)
    if (target) {
      try {
        navigation.navigate(target.screen, target.params)
      } catch {
        openNotificationTarget(target)
      }
    }
  }

  return (
    <Screen
      title="Notifications"
      subtitle={unread ? `${unread} unread` : 'All caught up'}
      padded={false}
      right={
        unread ? (
          <Button
            label="Read all"
            variant="ghost"
            onPress={() => markAll.mutate()}
            loading={markAll.isPending}
            style={styles.readAll}
          />
        ) : undefined
      }
    >
      {query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <FlashList
          data={query.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="notifications-off-outline"
              title="All caught up"
              message="No notifications yet. We'll let you know when something needs attention."
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.title}
              subtitle={item.body ?? formatShortDate(item.created_at)}
              onPress={() => open(item)}
              right={
                !item.read ? (
                  <View style={styles.unreadDot} accessibilityLabel="Unread" />
                ) : (
                  <Text style={styles.date}>{formatShortDate(item.created_at)}</Text>
                )
              }
              showChevron={false}
            />
          )}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
  readAll: { minHeight: 40, paddingHorizontal: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  date: { color: colors.textFaint, fontSize: 12 },
})
