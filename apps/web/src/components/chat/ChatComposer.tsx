import type { RefObject, ChangeEvent, KeyboardEvent } from 'react'
import { FileText, Paperclip, Reply, Send, ShoppingCart, Smile, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { formatPrice } from '../../utils/format'
import { COMMON_CHAT_EMOJIS } from './constants'

type OrderOption = { id: string; total_amount?: number; status?: string }

type Props = {
  canSend: boolean
  message: string
  onMessageChange: (value: string) => void
  onSend: () => void
  onTyping: () => void
  isSending: boolean
  isUploading: boolean
  replyingTo: { id?: string; content?: string; sender_type?: string } | null
  onClearReply: () => void
  showEmojiPicker: boolean
  onToggleEmojiPicker: () => void
  onInsertEmoji: (emoji: string) => void
  showOrderPicker: boolean
  onToggleOrderPicker: () => void
  orders: OrderOption[]
  selectedOrder: OrderOption | null
  onSelectOrder: (order: OrderOption) => void
  onClearOrder: () => void
  selectedFiles: File[]
  filePreviews: string[]
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void
  onRemoveFile: (index: number) => void
  fileInputRef: RefObject<HTMLInputElement>
  inputRef: RefObject<HTMLInputElement>
  userRole?: string
}

export function ChatComposer({
  canSend,
  message,
  onMessageChange,
  onSend,
  onTyping,
  isSending,
  isUploading,
  replyingTo,
  onClearReply,
  showEmojiPicker,
  onToggleEmojiPicker,
  onInsertEmoji,
  showOrderPicker,
  onToggleOrderPicker,
  orders,
  selectedOrder,
  onSelectOrder,
  onClearOrder,
  selectedFiles,
  filePreviews,
  onFileSelect,
  onRemoveFile,
  fileInputRef,
  inputRef,
  userRole,
}: Props) {
  if (!canSend) {
    return (
      <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="py-2 text-center text-sm text-[var(--text-muted)]">
          You have view-only access to chat. Contact an account admin to send messages.
        </p>
      </div>
    )
  }

  return (
    <>
      {replyingTo ? (
        <div className="flex items-center justify-between border-t bg-[var(--brand-ultra)]/50 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Reply className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="text-[var(--text-muted)]">Replying to:</span>
            <span className="max-w-xs truncate">{replyingTo.content}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearReply}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
      {(selectedFiles.length > 0 || selectedOrder) && (
        <div className="space-y-2 border-t bg-[var(--brand-ultra)]/30 px-4 py-3">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-lg border bg-background p-2"
            >
              {filePreviews[index] ? (
                <img
                  src={filePreviews[index]}
                  alt={file.name}
                  className="h-12 w-12 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-[var(--brand-ultra)]">
                  <FileText className="h-6 w-6 text-[var(--text-muted)]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{file.name}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemoveFile(index)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {selectedOrder ? (
            <div className="flex items-center gap-2 rounded-lg border bg-background p-2">
              <ShoppingCart className="h-5 w-5 text-[var(--brand-mid)]" />
              <div className="flex-1 text-sm font-medium">
                Order #{selectedOrder.id.slice(0, 8)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearOrder}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <div className="border-t bg-gradient-to-t from-background to-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {showEmojiPicker ? (
          <div className="emoji-picker-container mb-3 max-h-48 overflow-y-auto rounded-lg border border-[var(--app-border)] bg-background p-3 shadow-xl dark:border-[var(--app-border-mid)]">
            <div className="grid grid-cols-8 gap-1">
              {COMMON_CHAT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onInsertEmoji(emoji)}
                  className="rounded p-1 text-2xl transition-transform duration-150 ease-out [@media(hover:hover)_and_(pointer:fine)]:hover:scale-125 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-[var(--brand-ultra)] erp-pressable"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <div className="flex gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx"
              onChange={onFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={onToggleEmojiPicker}
              title="Add emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={onToggleOrderPicker}
              disabled={!orders.length}
              title="Attach order"
            >
              <ShoppingCart className="h-4 w-4" />
            </Button>
          </div>
          <Input
            ref={inputRef}
            value={message}
            onChange={(e) => {
              onMessageChange(e.target.value)
              onTyping()
            }}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && !e.shiftKey && !isSending) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder={
              replyingTo
                ? `Reply to ${replyingTo.sender_type === String(userRole).toUpperCase() ? 'yourself' : 'message'}…`
                : 'Type a message…'
            }
            className="min-h-9 flex-1"
            disabled={isSending || isUploading}
          />
          <Button
            type="button"
            onClick={onSend}
            disabled={
              (!message.trim() && selectedFiles.length === 0 && !selectedOrder) ||
              isSending ||
              isUploading
            }
            className="h-9 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-mid)] px-4 text-white shadow-md hover:opacity-90"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {showOrderPicker && orders.length > 0 ? (
          <div className="order-picker-container mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--app-border)] bg-background p-3 shadow-xl dark:border-[var(--app-border-mid)]">
            <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">
              Select an order to share:
            </div>
            <div className="space-y-1">
              {orders.slice(0, 5).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onSelectOrder(order)}
                  className="w-full rounded p-2 text-left text-sm transition-colors hover:bg-[var(--brand-ultra)]"
                >
                  <div className="font-medium">Order #{order.id.slice(0, 8)}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {order.total_amount ? formatPrice(order.total_amount) : 'No amount'} •{' '}
                    {order.status}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
