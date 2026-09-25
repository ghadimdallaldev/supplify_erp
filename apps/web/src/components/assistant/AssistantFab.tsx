import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bot, Loader2, Paperclip, Send, Sparkles, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { ensureNamespace } from '../../i18n'
import { isEntitlementFeatureEnabled } from '../../lib/planLimits'
import { useAppSelector } from '../../hooks/redux'
import { useImpersonation } from '../../hooks/useImpersonation'
import {
  useGetAssistantCapabilitiesQuery,
  useGetAssistantMessagesQuery,
  useGetEntitlementsQuery,
  useGetPresignedUrlMutation,
  useSendAssistantMessageMutation,
} from '../../services/api'
import type { AssistantAttachment, AssistantMessage } from '../../types/assistant'
import { uploadFileThroughGateway } from '../../utils/fileUpload'

type LocalMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ tool: string; ok: boolean }>
  attachments?: AssistantAttachment[]
}

function suggestionKeysForRole(role: string | undefined, tools: string[]): string[] {
  if (role === 'ADMIN') return ['admin']
  if (tools.includes('get_my_stops') && !tools.includes('get_fulfillment_board')) {
    return ['stops', 'deliveries']
  }
  if (role === 'SUPPLIER') {
    return ['fulfillment', 'warehouse', 'orders', 'invoices']
  }
  const restaurantSuggestions = ['stock', 'need', 'orders', 'deliveries', 'invoices']
  if (tools.includes('get_followed_suppliers')) restaurantSuggestions.unshift('followedSuppliers')
  if (tools.includes('compare_supplier_prices')) restaurantSuggestions.unshift('bestPrices')
  return restaurantSuggestions
}

export function AssistantFab() {
  const { t, i18n } = useTranslation('assistant')
  const [open, setOpen] = useState(false)
  const { user } = useAppSelector((s) => s.auth)
  const { isImpersonating } = useImpersonation()
  const { data: entitlements } = useGetEntitlementsQuery(undefined, {
    skip: !user || (user.role === 'ADMIN' && !isImpersonating),
  })
  // The payload is `{ entitlements: {...} }`. Reading `entitlements.features`
  // directly always yielded undefined, so this gate was permanently false for
  // every non-admin user and the assistant entry point never rendered.
  const planHasAi =
    user?.role === 'ADMIN' && !isImpersonating
      ? true
      : isEntitlementFeatureEnabled(entitlements?.entitlements, 'ai_assistant')

  useEffect(() => {
    void ensureNamespace('assistant')
  }, [i18n.language])

  const { data: caps, isFetching: capsLoading } = useGetAssistantCapabilitiesQuery(undefined, {
    skip: !user || !open,
  })

  // The conversational assistant is a Scale entitlement. The API keeps its own
  // authoritative gate; the UI only avoids rendering an unavailable entry point.
  if (!user || !planHasAi) return null

  return (
    <>
      <button
        type="button"
        data-testid="assistant-fab"
        aria-label={t('openAria')}
        onClick={() => setOpen(true)}
        className={cn(
          'fixed z-40 flex h-12 w-12 items-center justify-center rounded-full',
          'bottom-[calc(5rem+env(safe-area-inset-bottom))] end-4 lg:bottom-6',
          'bg-[var(--brand-mid)] text-white shadow-lg',
          'transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)]/40'
        )}
      >
        <Sparkles className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          width="default"
          className="flex h-full flex-col gap-0 p-0 sm:max-w-md"
          data-testid="assistant-sheet"
        >
          <SheetHeader className="border-b border-[var(--app-border)] px-4 py-3 pe-12">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-[var(--brand-mid)]" />
              {t('title')}
            </SheetTitle>
            <SheetDescription className="text-xs text-[var(--text-muted)]">
              {t('subtitle')}
            </SheetDescription>
          </SheetHeader>

          <AssistantChatBody
            enabled={Boolean(caps?.enabled)}
            tools={caps?.tools || []}
            quotaRemaining={caps?.quotaRemaining}
            loadingCaps={capsLoading}
            role={user.role}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

function AssistantChatBody({
  enabled,
  tools,
  quotaRemaining,
  loadingCaps,
  role,
}: {
  enabled: boolean
  tools: string[]
  quotaRemaining?: number | null
  loadingCaps: boolean
  role?: string
}) {
  const { t } = useTranslation('assistant')
  const { isEffectiveSupplier } = useImpersonation()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [localMessages, setLocalMessages] = useState<LocalMsg[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [sendMessage, { isLoading }] = useSendAssistantMessageMutation()
  const [generatePresignedUrl] = useGetPresignedUrlMutation()

  const { data: history } = useGetAssistantMessagesQuery(
    { conversationId: conversationId! },
    { skip: !conversationId }
  )

  const messages: LocalMsg[] = useMemo(() => {
    if (localMessages.length) return localMessages
    return (history?.messages || [])
      .filter((m: AssistantMessage) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sources: m.toolPayload?.sources,
        attachments: m.toolPayload?.attachments,
      }))
  }, [history?.messages, localMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const suggestions = suggestionKeysForRole(role, tools)

  async function onSend(text: string) {
    const message = text.trim() || (selectedFiles.length ? 'Please review the attached files.' : '')
    if (!message || isLoading || isUploading || !enabled) return
    let optimistic: LocalMsg[] = messages
    try {
      setIsUploading(selectedFiles.length > 0)
      const attachments: AssistantAttachment[] = []
      for (const file of selectedFiles) {
        const presigned = await generatePresignedUrl({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }).unwrap()
        await uploadFileThroughGateway(presigned, file, file.type)
        if (!presigned.publicUrl) throw new Error('Upload did not return a file URL')
        attachments.push({
          fileUrl: presigned.publicUrl,
          fileType: file.type as AssistantAttachment['fileType'],
          fileName: file.name,
          fileSize: file.size,
        })
      }
      optimistic = [
        ...messages,
        { id: `u-${Date.now()}`, role: 'user', content: message, attachments },
      ]
      setLocalMessages(optimistic)
      setDraft('')
      setSelectedFiles([])
      const res = await sendMessage({
        conversationId,
        message,
        attachments: attachments.length ? attachments : undefined,
      }).unwrap()
      setConversationId(res.conversationId)
      setLocalMessages([
        ...optimistic,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.reply,
          sources: res.sources,
        },
      ])
    } catch {
      setLocalMessages([
        ...optimistic,
        { id: `e-${Date.now()}`, role: 'assistant', content: t('error') },
      ])
    } finally {
      setIsUploading(false)
    }
  }

  function startNew() {
    setConversationId(null)
    setLocalMessages([])
    setDraft('')
    setSelectedFiles([])
  }

  if (loadingCaps) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-[var(--text-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">{t('unavailable')}</p>
        <Button asChild variant="outline" size="sm">
          <Link
            to={isEffectiveSupplier ? '/app/settings?tab=plan' : '/app/settings?tab=subscription'}
          >
            {t('upgrade')}
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] px-4 py-2 text-xs text-[var(--text-muted)]">
        <span>{quotaRemaining != null ? t('quotaHint', { remaining: quotaRemaining }) : null}</span>
        <button
          type="button"
          className="font-medium text-[var(--brand-mid)] hover:underline"
          onClick={startNew}
        >
          {t('newChat')}
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!messages.length && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">{t('empty')}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="rounded-full border border-[var(--app-border)] bg-[var(--surface)] px-3 py-1.5 text-start text-xs hover:border-[var(--brand-mid)]"
                  onClick={() => onSend(t(`suggestions.${key}`))}
                >
                  {t(`suggestions.${key}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'max-w-[90%] rounded-2xl px-3 py-2 text-sm',
              m.role === 'user'
                ? 'ms-auto bg-[var(--brand-mid)] text-white'
                : 'me-auto border border-[var(--app-border)] bg-[var(--surface)]'
            )}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.attachments?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.attachments.map((attachment) => (
                  <a
                    key={`${m.id}-${attachment.fileUrl}`}
                    href={attachment.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 rounded border border-current/20 px-2 py-1 text-[10px] underline-offset-2 hover:underline"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{attachment.fileName}</span>
                  </a>
                ))}
              </div>
            ) : null}
            {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
              <p className="mt-1 text-[10px] opacity-70">
                {t('fromLiveData')}: {m.sources.map((s) => s.tool).join(', ')}
              </p>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="me-auto flex items-center gap-2 rounded-2xl border border-[var(--app-border)] px-3 py-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('thinking')}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="space-y-2 border-t border-[var(--app-border)] p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void onSend(draft)
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []).filter(
              (file) => file.size <= 10 * 1024 * 1024
            )
            setSelectedFiles((current) => [...current, ...files].slice(0, 5))
            event.target.value = ''
          }}
        />
        {selectedFiles.length ? (
          <div className="flex flex-wrap gap-1">
            {selectedFiles.map((file, index) => (
              <span
                key={`${file.name}-${index}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--bg)] px-2 py-1 text-[10px]"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="max-w-40 truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setSelectedFiles((files) => files.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Attach files"
            disabled={isLoading || isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('placeholder')}
            className="min-w-0 flex-1 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-mid)]/30"
            disabled={isLoading || isUploading}
            data-testid="assistant-input"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || isUploading || (!draft.trim() && !selectedFiles.length)}
            aria-label={t('send')}
            data-testid="assistant-send"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
