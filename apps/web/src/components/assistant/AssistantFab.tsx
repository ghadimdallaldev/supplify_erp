import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bot, Copy, History, Loader2, Paperclip, Send, Sparkles, X } from 'lucide-react'
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
  useGetAssistantConversationsQuery,
  useGetEntitlementsQuery,
  useGetPresignedUrlMutation,
  useSendAssistantMessageMutation,
} from '../../services/api'
import type { AssistantAttachment, AssistantMessage, AssistantSource } from '../../types/assistant'
import { uploadFileThroughGateway } from '../../utils/fileUpload'

type LocalMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: AssistantSource[]
  attachments?: AssistantAttachment[]
}

function suggestionKeysForRole(role: string | undefined, tools: string[]): string[] {
  if (role === 'ADMIN') return ['admin']
  if (tools.includes('get_my_stops') && !tools.includes('get_fulfillment_board')) {
    return ['stops', 'deliveries']
  }
  if (role === 'SUPPLIER') {
    return [
      'attention',
      ...[
        ['fulfillment', 'get_fulfillment_board'],
        ['warehouse', 'get_warehouse_stock'],
        ['orders', 'get_orders'],
        ['invoices', 'get_invoices'],
      ]
        .filter(([, tool]) => tools.includes(tool))
        .map(([key]) => key),
    ]
  }
  const restaurantSuggestions = [
    'attention',
    ...[
      ['stock', 'get_inventory'],
      ['need', 'get_reorder_need'],
      ['orders', 'get_orders'],
      ['deliveries', 'get_deliveries'],
      ['invoices', 'get_invoices'],
    ]
      .filter(([, tool]) => tools.includes(tool))
      .map(([key]) => key),
  ]
  if (tools.includes('get_reservations')) restaurantSuggestions.push('reservations')
  if (tools.includes('get_followed_suppliers')) restaurantSuggestions.unshift('followedSuppliers')
  if (tools.includes('compare_supplier_prices')) restaurantSuggestions.unshift('bestPrices')
  return restaurantSuggestions
}

export function AssistantFab() {
  const { t, i18n } = useTranslation('assistant')
  const [open, setOpen] = useState(false)
  // Conversation state lives above the Sheet: its content unmounts on close, which used to
  // throw away the chat every time the sheet was dismissed.
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [localMessages, setLocalMessages] = useState<LocalMsg[]>([])
  const [draft, setDraft] = useState('')
  const [conversationScope, setConversationScope] = useState('')
  const { user } = useAppSelector((s) => s.auth)
  const userId = user?.id ?? null
  const { isImpersonating, tenantId, tenantName, effectiveRole } = useImpersonation()
  const scopeKey = `${userId}:${tenantId || 'admin'}`
  const activeScope = useRef(scopeKey)
  activeScope.current = scopeKey
  useEffect(() => {
    // A different signed-in user must never see the previous user's conversation.
    setConversationId(null)
    setLocalMessages([])
    setDraft('')
    setConversationScope(`${userId}:${tenantId || 'admin'}`)
  }, [userId, tenantId])
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
          className="flex h-full flex-col gap-0 p-0 sm:max-w-xl"
          data-testid="assistant-sheet"
        >
          <SheetHeader className="border-b border-[var(--app-border)] px-4 py-3 pe-12">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-[var(--brand-mid)]" />
              {t('title')}
            </SheetTitle>
            <SheetDescription className="text-xs text-[var(--text-muted)]">
              {t('subtitle')}
              {tenantName && <span className="mt-1 block font-medium">{tenantName}</span>}
            </SheetDescription>
          </SheetHeader>

          <AssistantChatBody
            key={`${userId}:${tenantId || 'admin'}`}
            isCurrentScope={() => activeScope.current === scopeKey}
            enabled={Boolean(caps?.enabled)}
            reason={caps?.reason}
            tools={caps?.tools || []}
            quotaRemaining={caps?.quotaRemaining}
            loadingCaps={capsLoading && !caps}
            role={effectiveRole || user.role}
            conversationId={conversationScope === scopeKey ? conversationId : null}
            setConversationId={setConversationId}
            localMessages={conversationScope === scopeKey ? localMessages : []}
            setLocalMessages={setLocalMessages}
            draft={conversationScope === scopeKey ? draft : ''}
            setDraft={setDraft}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

function AssistantChatBody({
  enabled,
  reason,
  tools,
  quotaRemaining,
  loadingCaps,
  role,
  conversationId,
  setConversationId,
  localMessages,
  setLocalMessages,
  draft,
  setDraft,
  isCurrentScope,
}: {
  enabled: boolean
  reason?: string | null
  tools: string[]
  quotaRemaining?: number | null
  loadingCaps: boolean
  role?: string
  conversationId: string | null
  setConversationId: Dispatch<SetStateAction<string | null>>
  localMessages: LocalMsg[]
  setLocalMessages: Dispatch<SetStateAction<LocalMsg[]>>
  draft: string
  setDraft: Dispatch<SetStateAction<string>>
  isCurrentScope: () => boolean
}) {
  const { t, i18n } = useTranslation('assistant')
  const { isEffectiveSupplier } = useImpersonation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [before, setBefore] = useState<string | undefined>()
  const [olderMessages, setOlderMessages] = useState<LocalMsg[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [uiError, setUiError] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [conversationOffset, setConversationOffset] = useState(0)
  const { data: conversations, isFetching: historyLoading } = useGetAssistantConversationsQuery(
    { offset: conversationOffset },
    { skip: !showHistory || !enabled }
  )
  const [sendMessage, { isLoading }] = useSendAssistantMessageMutation()
  const [generatePresignedUrl] = useGetPresignedUrlMutation()

  const { currentData: history } = useGetAssistantMessagesQuery(
    { conversationId: conversationId!, before },
    { skip: !conversationId }
  )

  const messages: LocalMsg[] = useMemo(() => {
    const latest = localMessages.length
      ? localMessages
      : (history?.messages || [])
          .filter((m: AssistantMessage) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            sources: m.toolPayload?.sources,
            attachments: m.toolPayload?.attachments,
          }))
    return [...latest, ...olderMessages].filter(
      (message, index, all) => all.findIndex((item) => item.id === message.id) === index
    )
  }, [history?.messages, localMessages, olderMessages])

  useEffect(() => {
    const savedLast = history?.messages.at(-1)
    const localLast = localMessages.at(-1)
    if (
      !isLoading &&
      savedLast?.role === 'assistant' &&
      localLast?.role === 'assistant' &&
      savedLast.content === localLast.content
    ) {
      setLocalMessages([])
    }
  }, [history, localMessages, isLoading, setLocalMessages])

  useEffect(() => {
    if (!before) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages, isLoading, before])

  const suggestions = suggestionKeysForRole(role, tools)

  async function onSend(text: string) {
    const message = text.trim() || (selectedFiles.length ? 'Please review the attached files.' : '')
    if (!message || isLoading || isUploading || !enabled || quotaRemaining === 0) return
    let optimistic: LocalMsg[] = messages
    try {
      setUiError('')
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
      if (!mounted.current) return
      optimistic = [
        ...messages,
        { id: `u-${Date.now()}`, role: 'user', content: message, attachments },
      ]
      setLocalMessages(optimistic)
      setOlderMessages([])
      setBefore(undefined)
      setDraft('')
      setSelectedFiles([])
      const res = await sendMessage({
        conversationId,
        message,
        attachments: attachments.length ? attachments : undefined,
      }).unwrap()
      if (!isCurrentScope()) return
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
      if (!isCurrentScope()) return
      setDraft(text)
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
    setOlderMessages([])
    setBefore(undefined)
    setShowHistory(false)
    setUiError('')
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
        <p className="text-sm text-[var(--text-muted)]">
          {t(reason === 'feature_disabled' ? 'unavailable' : 'serviceUnavailable')}
        </p>
        {reason === 'feature_disabled' && (
          <Button asChild variant="outline" size="sm">
            <Link
              to={isEffectiveSupplier ? '/app/settings?tab=plan' : '/app/settings?tab=subscription'}
            >
              {t('upgrade')}
            </Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      dir={i18n.language.startsWith('ar') ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] px-4 py-2 text-xs text-[var(--text-muted)]">
        <span>{quotaRemaining != null ? t('quotaHint', { remaining: quotaRemaining }) : null}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1 font-medium"
            disabled={isLoading || isUploading}
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
            {t('history')}
          </button>
          <button
            type="button"
            className="font-medium text-[var(--brand-mid)] hover:underline"
            onClick={startNew}
            disabled={isLoading || isUploading}
          >
            {t('newChat')}
          </button>
        </div>
      </div>

      {showHistory && (
        <div
          className="max-h-56 overflow-y-auto border-b border-[var(--app-border)] bg-[var(--surface)] p-3"
          aria-label={t('history')}
        >
          {historyLoading ? (
            <p role="status">{t('thinking')}</p>
          ) : !conversations?.conversations.length ? (
            <p>{t('noHistory')}</p>
          ) : (
            conversations.conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                className="block min-h-11 w-full truncate rounded-lg px-3 py-2 text-start text-sm hover:bg-[var(--bg)]"
                onClick={() => {
                  startNew()
                  setConversationId(conversation.id)
                }}
              >
                {conversation.title || t('newChat')}
              </button>
            ))
          )}
          <div className="mt-2 flex justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={conversationOffset === 0 || historyLoading}
              onClick={() => setConversationOffset(Math.max(0, conversationOffset - 20))}
            >
              {t('previous')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={(conversations?.conversations.length || 0) < 20 || historyLoading}
              onClick={() => setConversationOffset(conversationOffset + 20)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {history?.hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOlderMessages(messages)
              setLocalMessages([])
              setBefore(history.nextBefore || undefined)
            }}
          >
            {t('older')}
          </Button>
        )}
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
                  disabled={isLoading || isUploading || quotaRemaining === 0}
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
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</p>
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
            {m.role === 'assistant' && (
              <div className="mt-3 space-y-2 border-t border-[var(--app-border)] pt-2">
                {m.sources
                  ?.filter(
                    (source, index, all) =>
                      all.findIndex((item) => item.tool === source.tool) === index
                  )
                  .map((source) => (
                    <div key={source.tool} className="text-xs text-[var(--text-muted)]">
                      {source.ok && source.evidence?.href ? (
                        <Link
                          className="font-medium text-[var(--brand-mid)] underline"
                          to={source.evidence.href}
                        >
                          {t(`sources.${source.tool}`, { defaultValue: t('sourceData') })}
                        </Link>
                      ) : (
                        <span>
                          {t(`sources.${source.tool}`, { defaultValue: t('sourceData') })}
                        </span>
                      )}
                      {' · '}
                      {source.ok ? t('sourceVerified') : t('sourceUnavailable')}
                      {source.evidence?.fetchedAt && (
                        <time className="ms-1" dateTime={source.evidence.fetchedAt}>
                          {new Date(source.evidence.fetchedAt).toLocaleTimeString(i18n.language, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      )}
                      {source.evidence?.limited && (
                        <span className="block">{t('limitedResults')}</span>
                      )}
                    </div>
                  ))}
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center gap-1 text-xs"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(m.content)
                      .then(() => setCopiedId(m.id))
                      .catch(() => setUiError(t('copyFailed')))
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t(copiedId === m.id ? 'copied' : 'copy')}
                </button>
              </div>
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
        {uiError && (
          <p role="alert" className="text-xs text-red-700">
            {uiError}
          </p>
        )}
        {quotaRemaining === 0 && (
          <p role="status" className="text-xs text-[var(--text-muted)]">
            {t('quotaExhausted')}
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []).filter(
              (file) =>
                file.size <= 10 * 1024 * 1024 &&
                ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)
            )
            if (
              files.length !== event.target.files?.length ||
              selectedFiles.length + files.length > 5
            )
              setUiError(t('fileLimits'))
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
                  aria-label={t('removeFile', { name: file.name })}
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
            aria-label={t('attachFiles')}
            disabled={isLoading || isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('placeholder')}
            className="min-w-0 flex-1 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-mid)]/30"
            disabled={isLoading || isUploading}
            data-testid="assistant-input"
          />
          <Button
            type="submit"
            size="icon"
            disabled={
              isLoading ||
              isUploading ||
              quotaRemaining === 0 ||
              (!draft.trim() && !selectedFiles.length)
            }
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
