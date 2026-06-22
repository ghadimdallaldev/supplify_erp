import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, MessageSquare, Pin, Plus, Search, Store, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'

type Conversation = {
  id: string
  participant_name?: string
  last_message_preview?: string
  last_message_at?: string
  unread_count?: number
  is_pinned?: boolean
}

type Props = {
  conversations: Conversation[]
  selectedConversationId: string | null
  onSelect: (id: string) => void
  listFilter: string
  onListFilterChange: (value: string) => void
  userRole?: string
  formatConversationDate: (date: string) => string
  onNewMessage?: () => void
  className?: string
}

function ParticipantAvatar({ name }: { name: string }) {
  const initial = (name.trim().charAt(0) || '?').toUpperCase()
  return (
    <div
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-sm font-semibold text-[var(--brand-mid)]"
    >
      {initial}
    </div>
  )
}

export function ChatConversationList({
  conversations,
  selectedConversationId,
  onSelect,
  listFilter,
  onListFilterChange,
  userRole,
  formatConversationDate,
  onNewMessage,
  className = '',
}: Props) {
  const { t } = useTranslation('chat')
  const hasConversations = conversations.length > 0
  const filtered = listFilter.trim()
    ? conversations.filter((c) =>
        (c.participant_name || '').toLowerCase().includes(listFilter.toLowerCase())
      )
    : conversations

  const sorted = [...filtered].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1
    if (!a.is_pinned && b.is_pinned) return 1
    return 0
  })

  return (
    <Card className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      <CardHeader className="shrink-0 space-y-3 border-b border-[var(--app-border)] pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <MessageSquare className="h-5 w-5 text-[var(--brand-mid)]" aria-hidden />
            {t('list.inbox')}
          </CardTitle>
          {onNewMessage ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={onNewMessage}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('list.new')}
            </Button>
          ) : null}
        </div>
        {hasConversations ? (
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              placeholder={t('list.searchPeople')}
              value={listFilter}
              onChange={(e) => onListFilterChange(e.target.value)}
              className="h-9 pl-8 pr-8"
              aria-label={t('list.searchConversationsAria')}
            />
            {listFilter ? (
              <button
                type="button"
                onClick={() => onListFilterChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                aria-label={t('list.clearSearchAria')}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
        {sorted.length === 0 ? (
          <div className="space-y-3 px-4 py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
              <MessageSquare className="h-6 w-6" aria-hidden />
            </div>
            <p className="text-sm font-medium text-[var(--text)]">
              {listFilter ? t('list.noMatching') : t('list.noConversations')}
            </p>
            {!listFilter && userRole === 'RESTAURANT' && (
              <>
                <p className="text-sm text-[var(--text-mid)]">{t('list.restaurantEmptyHint')}</p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/suppliers">
                    <Building2 className="mr-2 h-4 w-4" />
                    {t('list.browseSuppliers')}
                  </Link>
                </Button>
              </>
            )}
            {!listFilter && userRole === 'SUPPLIER' && (
              <>
                <p className="text-sm text-[var(--text-mid)]">{t('list.supplierEmptyHint')}</p>
                {onNewMessage ? (
                  <Button variant="outline" size="sm" onClick={onNewMessage}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('list.newMessage')}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/app/restaurants">
                      <Store className="mr-2 h-4 w-4" />
                      {t('list.browseRestaurants')}
                    </Link>
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--app-border)]">
            {sorted.map((conv) => {
              const selected = selectedConversationId === conv.id
              const unread = (conv.unread_count ?? 0) > 0
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conv.id)}
                    className={cn(
                      'chat-list-item flex w-full gap-3 px-3 py-3 text-left',
                      selected && 'bg-[var(--brand-pale)]/55',
                      !selected && conv.is_pinned && 'bg-[var(--brand-ultra)]/80'
                    )}
                  >
                    <ParticipantAvatar
                      name={conv.participant_name || t('page.defaultParticipant')}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {conv.is_pinned ? (
                            <Pin
                              className="h-3 w-3 shrink-0 fill-current text-[var(--brand-mid)]"
                              aria-label={t('list.pinnedAria')}
                            />
                          ) : null}
                          <span
                            className={cn(
                              'truncate text-sm',
                              unread
                                ? 'font-semibold text-[var(--text)]'
                                : 'font-medium text-[var(--text)]'
                            )}
                          >
                            {conv.participant_name}
                          </span>
                        </div>
                        {conv.last_message_at ? (
                          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                            {formatConversationDate(conv.last_message_at)}
                          </span>
                        ) : null}
                      </div>
                      <p
                        className={cn(
                          'line-clamp-2 text-sm leading-snug',
                          unread ? 'font-medium text-[var(--text-mid)]' : 'text-[var(--text-muted)]'
                        )}
                      >
                        {conv.last_message_preview || t('list.noMessagesYet')}
                      </p>
                      {unread ? (
                        <span className="mt-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--brand-mid)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                          {conv.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
