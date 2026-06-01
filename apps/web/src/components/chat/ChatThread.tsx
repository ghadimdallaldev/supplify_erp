import { format, isToday, isYesterday } from 'date-fns'
import { Link } from 'react-router-dom'
import { ChevronDown, Download, Eye, FileText, Reply, ShoppingCart } from 'lucide-react'
import { Button } from '../ui/button'
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
  orders = [],
  replyingToId,
  onReply,
  otherPartyTyping,
  formatMessageDate,
  messagesContainerRef,
  messagesEndRef,
  showScrollButton,
  onScrollToBottom,
}: Props) {
  const isEmpty = groupedMessages.every((g) => g.messages.length === 0)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={messagesContainerRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messagesLoading ? (
          <div className="text-center text-[var(--text-muted)]">Loading messages...</div>
        ) : isEmpty ? (
          <div className="text-center text-[var(--text-muted)]">
            {searchQuery ? 'No messages found' : 'No messages yet. Start the conversation!'}
          </div>
        ) : (
          <>
            {groupedMessages.map((group) => (
              <div key={group.date}>
                <div className="my-6 flex items-center justify-center">
                  <div className="rounded-full border border-[var(--app-border)] bg-gradient-to-r from-[var(--brand-ultra)] to-[var(--brand-pale)] px-4 py-1.5 text-xs font-medium text-[var(--brand-mid)] shadow-sm dark:border-[var(--brand)] dark:from-[var(--brand)] dark:to-[var(--text)] dark:text-[var(--brand-light)]">
                    {isToday(new Date(group.date))
                      ? 'Today'
                      : isYesterday(new Date(group.date))
                        ? 'Yesterday'
                        : format(new Date(group.date), 'MMMM d, yyyy')}
                  </div>
                </div>
                {group.messages.map((msg: Record<string, unknown>, msgIndex: number) => {
                  const isMyMessage =
                    String(msg.sender_type || '') === String(userRole || '').toUpperCase()
                  const prevMsg =
                    msgIndex > 0 ? (group.messages[msgIndex - 1] as Record<string, unknown>) : null

                  return (
                    <div
                      key={String(msg.id)}
                      className={`mb-1 flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] ${isMyMessage ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}
                      >
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-md transition-all hover:shadow-lg ${
                            isMyMessage
                              ? 'border border-white/20 bg-gradient-to-br from-[var(--brand)] to-[var(--brand-mid)] text-white'
                              : 'border border-[var(--app-border)] bg-gradient-to-br from-[var(--surface)] via-[var(--brand-ultra)] to-[var(--brand-ultra)] text-[var(--text)]'
                          } ${msg.isOptimistic ? 'opacity-80' : ''}`}
                        >
                          {msg.reply_to && msg.reply_to_content ? (
                            <div
                              className={`mb-1 border-b pb-1 text-xs opacity-70 ${isMyMessage ? 'border-white/20' : 'border-[var(--app-border)]'}`}
                            >
                              <div className="flex items-start gap-1">
                                <Reply className="mt-0.5 h-3 w-3 shrink-0" />
                                <div className="min-w-0 flex-1 truncate">
                                  {String(msg.reply_to_content)}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {msg.order_id ? (
                            <div
                              className={`mb-2 rounded-lg border-2 p-3 ${
                                isMyMessage
                                  ? 'border-white/20 bg-white/10'
                                  : 'border-[var(--app-border-mid)] bg-[var(--brand-ultra)] dark:bg-[var(--text)]'
                              }`}
                            >
                              <div className="mb-2 flex items-center gap-2">
                                <ShoppingCart
                                  className={`h-4 w-4 ${isMyMessage ? 'text-white' : 'text-[var(--brand-mid)]'}`}
                                />
                                <span className="text-sm font-semibold">Order reference</span>
                              </div>
                              <Link
                                to={`/app/orders/${String(msg.order_id)}`}
                                className="inline-flex items-center gap-1 text-xs underline"
                              >
                                <Eye className="h-3 w-3" />
                                View order
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
                                        alt={String(att.fileName || 'Attachment')}
                                        className="max-h-64 max-w-full cursor-pointer rounded-lg object-cover"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={String(att.fileUrl)}
                                      download={String(att.fileName)}
                                      className={`flex items-center gap-2 rounded-lg border p-2 ${
                                        isMyMessage
                                          ? 'border-white/20 bg-white/10 text-white'
                                          : 'border-[var(--app-border-mid)] bg-[var(--brand-ultra)]'
                                      }`}
                                    >
                                      <FileText className="h-4 w-4" />
                                      <span className="truncate text-sm">
                                        {String(att.fileName)}
                                      </span>
                                      <Download className="ml-auto h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="whitespace-pre-wrap break-words text-sm">
                            {String(msg.content || '')}
                          </div>
                          <div
                            className={`mt-1 flex items-center gap-1 text-xs ${isMyMessage ? 'text-white/70' : 'text-[var(--text-muted)]'}`}
                          >
                            <span>{formatMessageDate(String(msg.created_at))}</span>
                            {isMyMessage ? <span>{msg.is_read ? '✓✓' : '✓'}</span> : null}
                          </div>
                        </div>
                        {!isMyMessage ? (
                          <button
                            type="button"
                            onClick={() => onReply(msg)}
                            className="mt-1 px-2 text-xs text-[var(--text-muted)] hover:text-foreground"
                          >
                            Reply
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
                <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--brand-ultra)] px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand)]"
                      style={{ animationDelay: '0ms' }}
                    />
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand-mid)]"
                      style={{ animationDelay: '150ms' }}
                    />
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-[var(--brand)]"
                      style={{ animationDelay: '300ms' }}
                    />
                    <span className="ml-2 text-xs text-[var(--text-muted)]">typing…</span>
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
          className="absolute bottom-4 right-4 h-10 w-10 rounded-full p-0 shadow-lg"
          aria-label="Scroll to latest"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  )
}
