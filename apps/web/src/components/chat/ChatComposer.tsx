import type { RefObject, ChangeEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Paperclip, Reply, Send, ShoppingCart, Smile, X } from 'lucide-react'
import { Button } from '../ui/button'
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
  inputRef: RefObject<HTMLTextAreaElement>
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
  const { t } = useTranslation('chat')

  if (!canSend) {
    return (
      <div className="shrink-0 border-t border-[var(--app-border)] bg-[var(--surface)] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="py-2 text-center text-sm text-[var(--text-mid)]">{t('composer.viewOnly')}</p>
      </div>
    )
  }

  const canSendNow =
    (message.trim().length > 0 || selectedFiles.length > 0 || selectedOrder != null) &&
    !isSending &&
    !isUploading

  return (
    <div className="shrink-0 border-t border-[var(--app-border)] bg-[var(--surface)]">
      {replyingTo ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--brand-ultra)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Reply className="h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
            <span className="shrink-0 text-[var(--text-mid)]">{t('composer.replyingTo')}</span>
            <span className="truncate font-medium text-[var(--text)]">{replyingTo.content}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearReply}
            className="h-7 w-7 shrink-0 p-0"
            aria-label={t('composer.cancelReplyAria')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {(selectedFiles.length > 0 || selectedOrder) && (
        <div className="space-y-2 border-b border-[var(--app-border)] bg-[var(--brand-ultra)]/60 px-4 py-3">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-2"
            >
              {filePreviews[index] ? (
                <img
                  src={filePreviews[index]}
                  alt=""
                  className="h-11 w-11 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--brand-pale)]">
                  <FileText className="h-5 w-5 text-[var(--brand-mid)]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--text)]">{file.name}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemoveFile(index)}
                className="h-7 w-7 p-0"
                aria-label={t('composer.removeFileAria', { fileName: file.name })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {selectedOrder ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--brand-pale)]">
                <ShoppingCart className="h-5 w-5 text-[var(--brand-mid)]" />
              </div>
              <div className="min-w-0 flex-1 text-sm font-medium text-[var(--text)]">
                {t('composer.orderNumber', { id: selectedOrder.id.slice(0, 8) })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearOrder}
                className="h-7 w-7 p-0"
                aria-label={t('composer.removeOrderAria')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {showEmojiPicker ? (
          <div className="emoji-picker-container mb-3 max-h-44 overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-2.5">
            <div className="grid grid-cols-8 gap-0.5">
              {COMMON_CHAT_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onInsertEmoji(emoji)}
                  className="erp-pressable rounded-md p-1.5 text-xl transition-colors hover:bg-[var(--brand-ultra)]"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-end gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)]/50 p-1.5 focus-within:border-[var(--brand-light)] focus-within:ring-2 focus-within:ring-[var(--brand-light)]/25">
          <div className="flex shrink-0 gap-0.5 pb-0.5 pl-0.5">
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
              className="h-8 w-8 p-0 text-[var(--text-mid)] hover:text-[var(--brand-mid)]"
              onClick={() => fileInputRef.current?.click()}
              title={t('composer.attachFileTitle')}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${showEmojiPicker ? 'text-[var(--brand-mid)]' : 'text-[var(--text-mid)] hover:text-[var(--brand-mid)]'}`}
              onClick={onToggleEmojiPicker}
              title={t('composer.addEmojiTitle')}
            >
              <Smile className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-[var(--text-mid)] hover:text-[var(--brand-mid)] disabled:opacity-40"
              onClick={onToggleOrderPicker}
              disabled={!orders.length}
              title={t('composer.attachOrderTitle')}
            >
              <ShoppingCart className="h-4 w-4" />
            </Button>
          </div>

          <textarea
            ref={inputRef}
            value={message}
            rows={1}
            onChange={(e) => {
              onMessageChange(e.target.value)
              onTyping()
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
            }}
            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey && !isSending) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder={
              replyingTo
                ? replyingTo.sender_type === String(userRole).toUpperCase()
                  ? t('composer.replyToSelfPlaceholder')
                  : t('composer.replyToMessagePlaceholder')
                : t('composer.writeMessagePlaceholder')
            }
            className="max-h-[120px] min-h-[36px] flex-1 resize-none border-0 bg-transparent py-2 text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-0"
            disabled={isSending || isUploading}
          />

          <Button
            type="button"
            onClick={onSend}
            disabled={!canSendNow}
            size="sm"
            className="erp-pressable mb-0.5 mr-0.5 h-8 shrink-0 bg-[var(--brand-mid)] px-3 hover:bg-[var(--brand)]"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">{t('composer.sendAria')}</span>
          </Button>
        </div>

        <p className="mt-2 hidden text-[11px] text-[var(--text-muted)] sm:block">
          {t('composer.keyboardHint')}
        </p>

        {showOrderPicker && orders.length > 0 ? (
          <div className="order-picker-container mt-2 max-h-44 overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-2">
            <p className="mb-1.5 px-1 text-xs font-medium text-[var(--text-mid)]">
              {t('composer.shareOrder')}
            </p>
            <div className="space-y-0.5">
              {orders.slice(0, 5).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onSelectOrder(order)}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--brand-ultra)]"
                >
                  <div className="font-medium text-[var(--text)]">
                    {t('composer.orderNumber', { id: order.id.slice(0, 8) })}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {order.total_amount ? formatPrice(order.total_amount) : t('composer.noAmount')}{' '}
                    · {order.status}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
