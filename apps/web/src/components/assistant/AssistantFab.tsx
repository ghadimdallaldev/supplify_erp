import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Loader2, Send, Sparkles } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { ensureNamespace } from '../../i18n'
import { featureEnabled } from '../../lib/planLimits'
import { useAppSelector } from '../../hooks/redux'
import { useImpersonation } from '../../hooks/useImpersonation'
import {
  useGetAssistantCapabilitiesQuery,
  useGetAssistantMessagesQuery,
  useGetEntitlementsQuery,
  useSendAssistantMessageMutation,
} from '../../services/api'
import type { AssistantMessage } from '../../types/assistant'

type LocalMsg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ tool: string; ok: boolean }>
}

function suggestionKeysForRole(role: string | undefined, tools: string[]): string[] {
  if (role === 'ADMIN') return ['admin']
  if (tools.includes('get_my_stops') && !tools.includes('get_fulfillment_board')) {
    return ['stops', 'deliveries']
  }
  if (role === 'SUPPLIER') {
    return ['fulfillment', 'warehouse', 'orders', 'invoices']
  }
  return ['stock', 'need', 'orders', 'deliveries', 'invoices']
}

export function AssistantFab() {
  const { t, i18n } = useTranslation('assistant')
  const [open, setOpen] = useState(false)
  const { user } = useAppSelector((s) => s.auth)
  const { isImpersonating } = useImpersonation()
  const { data: entitlements } = useGetEntitlementsQuery(undefined, {
    skip: !user || (user.role === 'ADMIN' && !isImpersonating),
  })
  const planHasAi = user?.role === 'ADMIN' && !isImpersonating
    ? true
    : featureEnabled(entitlements?.features?.ai_platform)

  useEffect(() => {
    void ensureNamespace('assistant')
  }, [i18n.language])

  const { data: caps, isFetching: capsLoading } = useGetAssistantCapabilitiesQuery(undefined, {
    skip: !user || !open,
  })

  // Show FAB when plan has ai_platform (or admin). Env-disabled still shows panel with unavailable.
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
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [localMessages, setLocalMessages] = useState<LocalMsg[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const [sendMessage, { isLoading }] = useSendAssistantMessageMutation()

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
      }))
  }, [history?.messages, localMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const suggestions = suggestionKeysForRole(role, tools)

  async function onSend(text: string) {
    const message = text.trim()
    if (!message || isLoading || !enabled) return
    const optimistic: LocalMsg[] = [
      ...messages,
      { id: `u-${Date.now()}`, role: 'user', content: message },
    ]
    setLocalMessages(optimistic)
    setDraft('')
    try {
      const res = await sendMessage({
        conversationId,
        message,
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
    }
  }

  function startNew() {
    setConversationId(null)
    setLocalMessages([])
    setDraft('')
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
          <a href="/app/settings?tab=subscription">{t('upgrade')}</a>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] px-4 py-2 text-xs text-[var(--text-muted)]">
        <span>
          {quotaRemaining != null
            ? t('quotaHint', { remaining: quotaRemaining })
            : null}
        </span>
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
        className="flex gap-2 border-t border-[var(--app-border)] p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void onSend(draft)
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('placeholder')}
          className="min-w-0 flex-1 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--brand-mid)]/30"
          disabled={isLoading}
          data-testid="assistant-input"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || !draft.trim()}
          aria-label={t('send')}
          data-testid="assistant-send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
