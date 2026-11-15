import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQueryClient } from '@tanstack/react-query'
import { useChatConversations, useOpenChatConversation } from '../../../services/api/queries'
import {
  connectChatSocket,
  getChatSocket,
  joinConversation,
  leaveConversation,
} from '../../../services/chatSocket'
import { queryKeys } from '../../../services/api/queries/keys'
import { useAuth } from '../../auth/AuthContext'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  EmptyState,
  ErrorState,
  FilterBar,
  FlashList,
  ListRow,
  ListSkeleton,
  Screen,
} from '../../../components/ui'
import { formatOrderRef, formatRelativeTimestamp } from '../../../utils/format'
import type { ChatConversation } from '../../../types/chat'
import { colors, theme, type } from '../../../theme'
import {
  NewCustomerConversationSheet,
  NewSupplierConversationSheet,
} from './NewConversationSheet'

export type ChatStackParamList = {
  ChatList: undefined
  ChatThread: { conversationId: string; title?: string }
}

export function ChatListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatStackParamList>>()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { can } = usePermissions()
  const query = useChatConversations(15_000)
  const openConversation = useOpenChatConversation()
  const [scope, setScope] = useState<'all' | 'unread'>('all')
  const [pickerOpen, setPickerOpen] = useState(false)

  const allConversations = query.data ?? []
  const unreadTotal = allConversations.reduce((sum, row) => sum + (row.unread_count ?? 0), 0)
  const unreadThreads = allConversations.filter((row) => (row.unread_count ?? 0) > 0).length

  const conversations = useMemo(
    () =>
      scope === 'unread'
        ? allConversations.filter((row) => (row.unread_count ?? 0) > 0)
        : allConversations,
    [allConversations, scope]
  )

  const conversationIds = useMemo(() => allConversations.map((row) => row.id), [allConversations])
  const roomKey = conversationIds.join('|')

  useFocusEffect(
    useCallback(() => {
      void query.refetch()
    }, [query.refetch])
  )

  useEffect(() => {
    const ids = roomKey ? roomKey.split('|') : []
    const socket = getChatSocket()
    const handleNewMessage = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations })
    }

    socket.on('new_message', handleNewMessage)
    ids.forEach(joinConversation)
    void connectChatSocket().catch(() => {})

    return () => {
      socket.off('new_message', handleNewMessage)
      ids.forEach(leaveConversation)
    }
  }, [queryClient, roomKey])

  const openThread = useCallback(
    (conversationId: string, title?: string) => {
      navigation.navigate('ChatThread', { conversationId, title })
    },
    [navigation]
  )

  const startConversation = useCallback(
    async (party: { id: string; name: string }) => {
      setPickerOpen(false)
      try {
        const conversation = await openConversation.mutateAsync(
          user?.role === 'SUPPLIER' ? { restaurantId: party.id } : { supplierId: party.id }
        )
        openThread(conversation.id, party.name)
      } catch (error) {
        Alert.alert(
          'Could not start conversation',
          error instanceof Error ? error.message : 'Try again.'
        )
      }
    },
    [openConversation, openThread, user?.role]
  )

  const canCompose = can('CHAT_SEND')
  const composeButton = canCompose ? (
    <Pressable
      onPress={() => setPickerOpen(true)}
      accessibilityRole="button"
      accessibilityLabel="New message"
      style={({ pressed }) => [styles.compose, pressed && styles.composePressed]}
      hitSlop={6}
    >
      <Ionicons name="create-outline" size={20} color={colors.brand} />
    </Pressable>
  ) : undefined

  const renderRow = (item: ChatConversation) => {
    const name = item.participant_name ?? item.title ?? 'Conversation'
    const unread = item.unread_count ?? 0
    const preview = item.last_message?.trim() || 'No messages yet'
    const timeLabel = formatRelativeTimestamp(item.last_message_at)
    return (
      <ListRow
        avatarLabel={name}
        title={name}
        strong={unread > 0}
        subtitle={preview}
        note={item.order_id ? `Order ${formatOrderRef(item.order_id)}` : undefined}
        onPress={() => openThread(item.id, name)}
        right={
          <View style={styles.right}>
            {timeLabel ? (
              <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{timeLabel}</Text>
            ) : null}
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </View>
        }
        showChevron={false}
      />
    )
  }

  return (
    <Screen
      title="Messages"
      subtitle={
        unreadTotal > 0
          ? `${unreadTotal} unread · ${allConversations.length} conversations`
          : `${allConversations.length} conversations`
      }
      right={composeButton}
      padded={false}
    >
      {unreadThreads > 0 ? (
        <FilterBar
          options={[
            { key: 'all', label: 'All', count: allConversations.length },
            { key: 'unread', label: 'Unread', count: unreadThreads },
          ]}
          value={scope}
          onChange={(key) => setScope(key as typeof scope)}
        />
      ) : null}

      {query.isLoading && !query.data ? (
        <ListSkeleton rows={8} />
      ) : query.isError ? (
        <ErrorState
          message="Could not load your conversations."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlashList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title={scope === 'unread' ? 'Nothing unread' : 'No conversations'}
              message={
                scope === 'unread'
                  ? 'You are all caught up.'
                  : user?.role === 'SUPPLIER'
                    ? 'Start a conversation with one of your customers.'
                    : 'Start a conversation with one of your suppliers.'
              }
              actionLabel={canCompose && scope === 'all' ? 'New message' : undefined}
              onAction={canCompose && scope === 'all' ? () => setPickerOpen(true) : undefined}
            />
          }
          renderItem={({ item }) => renderRow(item)}
        />
      )}

      {canCompose && user?.role === 'SUPPLIER' ? (
        <NewCustomerConversationSheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(party) => void startConversation(party)}
        />
      ) : null}
      {canCompose && user?.role !== 'SUPPLIER' ? (
        <NewSupplierConversationSheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(party) => void startConversation(party)}
        />
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
  compose: {
    width: theme.touchMin,
    height: theme.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composePressed: { opacity: 0.6 },
  right: { alignItems: 'flex-end', gap: theme.spacing.xs, flexShrink: 0 },
  time: { ...type.caption, color: colors.textFaint },
  timeUnread: { color: colors.brand, fontWeight: '600' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.onBrand },
})
