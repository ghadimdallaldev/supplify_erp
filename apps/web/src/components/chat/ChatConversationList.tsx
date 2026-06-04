import { Link } from 'react-router-dom'
import { Building2, Clock, MessageSquare, Pin, Plus, ShoppingCart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Search, X } from 'lucide-react'

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
  className?: string
  canStartConversation?: boolean
  onStartConversation?: () => void
}

export function ChatConversationList({
  conversations,
  selectedConversationId,
  onSelect,
  listFilter,
  onListFilterChange,
  userRole,
  formatConversationDate,
  className = '',
  canStartConversation = false,
  onStartConversation,
}: Props) {
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
    <Card className={`flex flex-col min-h-0 ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-5 w-5" />
            Conversations
          </CardTitle>
          {canStartConversation && onStartConversation ? (
            <Button type="button" size="sm" className="shrink-0" onClick={onStartConversation}>
              <Plus className="mr-1.5 h-4 w-4" />
              New
            </Button>
          ) : null}
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="Search people..."
            value={listFilter}
            onChange={(e) => onListFilterChange(e.target.value)}
            className="h-9 pl-8"
          />
          {listFilter ? (
            <button
              type="button"
              onClick={() => onListFilterChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-0 min-h-0">
        <div className="divide-y">
          {sorted.length === 0 ? (
            <div className="space-y-3 p-4 text-center text-sm text-[var(--text-muted)]">
              <MessageSquare className="mx-auto mb-2 h-12 w-12 text-[var(--text-muted)]/50" />
              <p className="font-medium">
                {listFilter ? 'No matching conversations' : 'No conversations yet'}
              </p>
              {!listFilter && userRole === 'RESTAURANT' && (
                <>
                  <p className="text-xs px-2">
                    Start a chat by messaging a supplier. Tap New above or pick one below.
                  </p>
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-center">
                    {onStartConversation ? (
                      <Button size="sm" onClick={onStartConversation}>
                        <Plus className="mr-2 h-4 w-4" />
                        New message
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/app/suppliers">
                        <Building2 className="mr-2 h-4 w-4" />
                        Browse suppliers
                      </Link>
                    </Button>
                  </div>
                </>
              )}
              {!listFilter && userRole === 'SUPPLIER' && (
                <>
                  <p className="text-xs px-2">
                    Restaurants start conversations with you. When someone messages, it will appear
                    here.
                  </p>
                  <Button variant="outline" size="sm" className="mt-1" asChild>
                    <Link to="/app/orders">
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      View orders
                    </Link>
                  </Button>
                </>
              )}
            </div>
          ) : (
            sorted.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelect(conv.id)}
                className={`w-full border-l-2 p-4 text-left transition-colors hover:bg-accent ${
                  selectedConversationId === conv.id
                    ? 'border-l-primary bg-accent'
                    : conv.is_pinned
                      ? 'border-l-[var(--brand-mid)] bg-[var(--brand-ultra)]/50 dark:bg-[var(--brand)]/20'
                      : 'border-l-transparent'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    {conv.is_pinned ? (
                      <Pin className="h-3 w-3 fill-current text-[var(--brand-mid)]" />
                    ) : null}
                    {conv.participant_name}
                  </div>
                  {(conv.unread_count ?? 0) > 0 ? (
                    <span className="rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-mid)] px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
                      {conv.unread_count}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-sm text-[var(--text-muted)]">
                  {conv.last_message_preview || 'No messages yet'}
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  {conv.last_message_at ? (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatConversationDate(conv.last_message_at)}
                    </span>
                  ) : (
                    'No messages'
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
