import { format, isToday, isYesterday } from 'date-fns'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  Download,
  Eye,
  FileText,
  MessageSquare,
  Reply,
  ShoppingCart,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import type { RefObject } from 'react'

type MessageGroup = { date: string; messages: Record<string, unknown>[] }

type Props = {
  messagesLoading: boolean
  groupedMessages: MessageGroup[]
  searchQuery: string
  userRole?: string
  orders?: { id: string; total_amount?: number; status?: string }[]
  replyingToId?: string | null
  onReply: (msg: Record<string, unknown>) => void
  otherPartyTyping: boolean
  formatMessageDate: (date: string) => string
  messagesContainerRef: RefObject<HTMLDivElement>
  messagesEndRef: RefObject<HTMLDivElement>
  showScrollButton: boolean
  onScrollToBottom: () => void
}

export function ChatThread({
  messagesLoading,
  groupedMessages,
  searchQuery,
  userRole,
  onReply,
  otherPartyTyping,
  formatMessageDate,
  messagesContainerRef,
  messagesEndRef,
  showScrollButton,
  onScrollToBottom,
}: Props) {
  const { t } = useTranslation('chat')
  const isEmpty = groupedMessages.every((g) => g.messages.length === 0)

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr)
    if (isToday(date)) return t('thread.today')
    if (isYesterday(date)) return t('thread.yesterday')
    return format(date, 'MMMM d, yyyy')
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[var(--brand-ultra)]/40">
      <div
        ref={messagesContainerRef}
        className="chat-thread-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-4 sm:px-5"
      >
        {messagesLoading ? (
          <div className="space-y-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <Skeleton className={`h-14 rounded-2xl ${i % 2 === 0 ? 'w-[72%]' : 'w-[58%]'}`} />
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
              <MessageSquare className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text)]">
                {searchQuery ? t('thread.noSearchResults') : t('thread.emptyTitle')}
              </p>
              <p className="mt-1 text-sm text-[var(--text-mid)]">
                {searchQuery ? t('thread.noSearchHint') : t('thread.emptyHint')}
              </p>
            </div>
          </div>
        ) : (
          <>
            {groupedMessages.map((group) => (
              <div key={group.date} className="pb-2">
                <div className="relative my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-[var(--app-border)]" aria-hidden />
                  <span className="shrink-0 text-xs font-medium text-[var(--text-mid)]">
                    {formatDateLabel(group.date)}
                  </span>
                  <div className="h-px flex-1 bg-[var(--app-border)]" aria-hidden />
                </div>

                {group.messages.map((msg, msgIndex) => {
                  const isMyMessage =
                    String(msg.sender_type || '') === String(userRole || '').toUpperCase()
                  const prev = group.messages[msgIndex - 1]
                  const next = group.messages[msgIndex + 1]
                  const groupedWithPrev =
                    prev != null && String(prev.sender_type) === String(msg.sender_type)
                  const groupedWithNext =
                    next != null && String(next.sender_type) === String(msg.sender_type)

                  const bubbleRadius = isMyMessage
                    ? groupedWithPrev && groupedWithNext
                      ? 'rounded-2xl rounded-tr-md rounded-br-md'
                      : groupedWithPrev
                        ? 'rounded-2xl rounded-tr-md'
                        : groupedWithNext
                          ? 'rounded-2xl rounded-br-md'
                          : 'rounded-2xl rounded-br-sm'
                    : groupedWithPrev && groupedWithNext
                      ? 'rounded-2xl rounded-tl-md rounded-bl-md'
                      : groupedWithPrev
                        ? 'rounded-2xl rounded-tl-md'
                        : groupedWithNext
                          ? 'rounded-2xl rounded-bl-md'
                          : 'rounded-2xl rounded-bl-sm'

                  return (
                    <div
                      key={String(msg.id)}
                      className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} ${
                        groupedWithNext ? 'mb-0.5' : 'mb-3'
                      }`}
                    >
                      <div
                        className={`max-w-[88%] sm:max-w-[72%] ${
                          isMyMessage ? 'items-end' : 'items-start'
                        } flex flex-col`}
                      >
                        <div
                          className={`px-3.5 py-2.5 ${bubbleRadius} ${
                            isMyMessage ? 'chat-bubble-out' : 'chat-bubble-in'
                          } ${msg.isOptimistic ? 'opacity-75' : ''}`}
                        >
                          {msg.reply_to && msg.reply_to_content ? (
                            <div
                              className={`mb-2 rounded-lg px-2.5 py-1.5 text-xs ${
                                isMyMessage
                                  ? 'bg-white/15 text-white/90'
                                  : 'border border-[var(--app-border)] bg-[var(--brand-ultra)] text-[var(--text-mid)]'
                              }`}
                            >
                              <div className="flex items-start gap-1.5">
                                <Reply className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
                                <span className="line-clamp-2">{String(msg.reply_to_content)}</span>
                              </div>
                            </div>
                          ) : null}

                          {msg.order_id ? (
                            <div
                              className={`mb-2 rounded-lg p-3 ${
                                isMyMessage
                                  ? 'bg-white/12'
                                  : 'border border-[var(--app-border)] bg-[var(--brand-ultra)]'
                              }`}
                            >
                              <div className="mb-1.5 flex items-center gap-2">
                                <ShoppingCart
                                  className={`h-4 w-4 ${isMyMessage ? 'text-white' : 'text-[var(--brand-mid)]'}`}
                                />
                                <span className="text-sm font-medium">
                                  {t('thread.orderReference')}
                                </span>
                              </div>
                              <Link
                                to={`/app/orders/${String(msg.order_id)}`}
                                className={`inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline ${
                                  isMyMessage ? 'text-white/90' : 'text-[var(--brand-mid)]'
                                }`}
                              >
                                <Eye className="h-3 w-3" />
                                {t('thread.viewOrder')}
                              </Link>
                            </div>
                          ) : null}

                          {Array.isArray(msg.attachments) && msg.attachments.length > 0 ? (
                            <div className="mb-2 space-y-2">
                              {(msg.attachments as Record<string, unknown>[]).map((att, i) => (
                                <div
                                  key={String(att.id || i)}
                                  className="overflow-hidden rounded-lg"
                                >
                                  {String(att.fileType || '').startsWith('image/') ? (
                                    <a
                                      href={String(att.fileUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <img
                                        src={String(att.fileUrl)}
                                        alt={String(att.fileName || t('thread.attachmentAlt'))}
                                        className="max-h-56 max-w-full cursor-pointer rounded-lg object-cover"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={String(att.fileUrl)}
                                      download={String(att.fileName)}
                                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${
                                        isMyMessage
                                          ? 'bg-white/12 text-white'
                                          : 'border border-[var(--app-border)] bg-[var(--brand-ultra)] text-[var(--text)]'
                                      }`}
                                    >
                                      <FileText className="h-4 w-4 shrink-0" />
                                      <span className="min-w-0 truncate text-sm">
                                        {String(att.fileName)}
                                      </span>
                                      <Download className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" />
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {String(msg.content || '')}
                          </div>

                          {!groupedWithNext ? (
                            <div
                              className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${
                                isMyMessage ? 'text-white/75' : 'text-[var(--text-muted)]'
                              }`}
                            >
                              <span>{formatMessageDate(String(msg.created_at))}</span>
                              {isMyMessage ? (
                                <span
                                  aria-label={
                                    msg.is_read ? t('thread.readAria') : t('thread.sentAria')
                                  }
                                >
                                  {msg.is_read ? '✓✓' : '✓'}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        {!isMyMessage && !groupedWithNext ? (
                          <button
                            type="button"
                            onClick={() => onReply(msg)}
                            className="mt-1 px-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--brand-mid)]"
                          >
                            {t('thread.reply')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            {otherPartyTyping ? (
              <div className="mb-2 flex justify-start">
                <div className="chat-bubble-in rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5" aria-live="polite">
                    <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--brand-mid)]" />
                    <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--brand-mid)]" />
                    <span className="chat-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--brand-mid)]" />
                    <span className="ml-1.5 text-xs text-[var(--text-mid)]">
                      {t('thread.typing')}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {showScrollButton ? (
        <Button
          type="button"
          onClick={onScrollToBottom}
          size="sm"
          variant="secondary"
          className="erp-pressable absolute bottom-4 right-4 h-9 w-9 rounded-full p-0"
          aria-label={t('thread.scrollToLatestAria')}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}
