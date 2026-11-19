import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useGetReorderAssistanceQuery,
  useGetEntitlementsQuery,
  useSuppressReorderSuggestionMutation,
  useGetQuickListsQuery,
  useAddItemToQuickListMutation,
  useExplainReorderAssistanceMutation,
  useAskReorderAssistanceMutation,
  useAiRecommendReorderAssistanceMutation,
  useFeedbackReorderAssistanceMutation,
  useSendAssistantMessageMutation,
} from '../../services/api'
import { isEntitlementFeatureEnabled } from '../../lib/planLimits'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { EmptyState } from '../ui/empty-state'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import {
  ShoppingCart,
  ListPlus,
  Clock,
  Ban,
  ExternalLink,
  Sparkles,
  Loader2,
  HelpCircle,
  MessageSquare,
  Flag,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { getUsageMeterDisplay } from '../../lib/usageDisplay'
import { usePermissions } from '../../hooks/usePermissions'
import type {
  ReorderAiAskResult,
  ReorderAiExplainResult,
  ReorderAiRecommendation,
  ReorderAssistanceItem,
  ReorderForecast,
} from '../../types/reorder'

const URGENCY_STYLES: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-800 border-red-200',
  HIGH: 'bg-amber-100 text-amber-900 border-amber-200',
  MEDIUM: 'bg-slate-100 text-slate-800 border-slate-200',
  LOW: 'bg-slate-50 text-slate-600 border-slate-100',
}

function resolveItemForecast(
  item: ReorderAssistanceItem,
  forecasts?: ReorderForecast[]
): ReorderAssistanceItem['forecast'] | null {
  if (item.forecast?.confidence != null || item.forecast?.reorderByDate) {
    return item.forecast
  }
  if ((item.reasonCode === 'forecast' || item.forecast) && item.productId && forecasts?.length) {
    const match = forecasts.find((f) => f.productId === item.productId)
    if (match) {
      return {
        confidence: match.confidence,
        reorderByDate: match.reorderByDate,
        explanation: match.explanation,
        forecastReorderQty: match.forecastReorderQty ?? undefined,
      }
    }
  }
  return item.forecast ?? null
}

function formatForecastConfidence(confidence?: number | null): string | null {
  if (confidence == null || !Number.isFinite(confidence)) return null
  const pct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence)
  return pct >= 75 ? 'Strong data' : pct >= 35 ? 'Limited data' : 'Review data'
}

function formatReorderByDate(date?: string | null): string | null {
  if (!date) return null
  const parsed = new Date(date.length === 10 ? `${date}T12:00:00Z` : date)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString(undefined, { timeZone: 'UTC' })
}

function recommendationLabel(source?: string): string {
  return source === 'ai' ? 'AI Reorder Recommendation' : 'Forecast Reorder Recommendation'
}

function resolveQty(item: ReorderAssistanceItem, recommendation?: ReorderAiRecommendation): number {
  if (
    item.action === 'wait' ||
    item.action === 'manual_review' ||
    recommendation?.action === 'wait' ||
    recommendation?.action === 'manual_review'
  )
    return 0
  const quantity = Number(recommendation?.recommendedQuantity ?? item.suggestedQty ?? 0)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

const REASON_STYLES: Record<string, string> = {
  low_stock: 'bg-red-50 text-red-700',
  near_expiry: 'bg-amber-50 text-amber-800',
  expired: 'bg-red-50 text-red-700',
  cadence: 'bg-[var(--brand-ultra)] text-[var(--brand)]',
  frequent: 'bg-emerald-50 text-emerald-800',
  quick_list: 'bg-blue-50 text-blue-800',
  not_ordered_recently: 'bg-slate-50 text-slate-700',
  forecast: 'bg-violet-50 text-violet-800',
}

export type ReorderAssistancePanelProps = {
  compact?: boolean
  maxItems?: number
  className?: string
}

export function ReorderAssistancePanel({
  compact = false,
  maxItems,
  className,
}: ReorderAssistancePanelProps) {
  const { t, i18n } = useTranslation('inventory')
  const { can } = usePermissions()
  const canOrder = can('ORDERS_CREATE')
  const canManage = can('INVENTORY_MANAGE')
  const { data, isLoading, isFetching, isError, refetch } = useGetReorderAssistanceQuery()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const { data: quickListsData } = useGetQuickListsQuery()
  const [suppressSuggestion, { isLoading: isSuppressing }] = useSuppressReorderSuggestionMutation()
  const [addItemToQuickList] = useAddItemToQuickListMutation()
  const [explainAssistance, { isLoading: isExplaining }] = useExplainReorderAssistanceMutation()
  const [askAssistance, { isLoading: isAsking }] = useAskReorderAssistanceMutation()
  const [askAssistant, { isLoading: isAssistantAnswering }] = useSendAssistantMessageMutation()
  const [aiRecommend, { isLoading: isAiRecommending }] = useAiRecommendReorderAssistanceMutation()
  const [sendFeedback] = useFeedbackReorderAssistanceMutation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedListId, setSelectedListId] = useState('')
  const lists = quickListsData?.quickLists || []
  const selectedList =
    lists.find((list) => list.id === selectedListId) ?? (lists.length === 1 ? lists[0] : undefined)
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainResult, setExplainResult] = useState<ReorderAiExplainResult | null>(null)
  const [askQuery, setAskQuery] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [askResult, setAskResult] = useState<ReorderAiAskResult | null>(null)
  const [askBusyProductId, setAskBusyProductId] = useState<string | null>(null)
  const [answerOpen, setAnswerOpen] = useState(false)
  const [answer, setAnswer] = useState<{ question: string; reply: string } | null>(null)
  const assistantConversationId = useRef<string | null>(null)
  const [recommendationsByProduct, setRecommendationsByProduct] = useState<
    Record<string, ReorderAiRecommendation>
  >({})
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')

  const suggestions = useMemo(() => data?.suggestions ?? [], [data])
  const forecasts = data?.forecasts ?? []
  const getAction = (item: ReorderAssistanceItem) =>
    item.action === 'manual_review' || item.action === 'wait'
      ? item.action
      : (item.productId ? recommendationsByProduct[item.productId]?.action : undefined) ||
        item.action
  const filtered = suggestions
    .filter(
      (item) =>
        (!search ||
          `${item.productName || item.productId || item.id} ${item.supplierName || ''}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())) &&
        (actionFilter === 'all' || getAction(item) === actionFilter) &&
        (supplierFilter === 'all' || item.supplierId === supplierFilter)
    )
    .sort(
      (a, b) =>
        (a.supplierName || '').localeCompare(b.supplierName || '') ||
        (a.productName || a.productId || a.id).localeCompare(b.productName || b.productId || b.id)
    )
  const visible = maxItems ? filtered.slice(0, maxItems) : filtered
  const canExplain = data?.smartReorder?.capabilities?.forecast === true
  const canAsk = data?.smartReorder?.capabilities?.seasonality === true
  const canExplainLlm = data?.ai?.canExplainLlm === true
  const canAskLlm = data?.ai?.canAskLlm === true

  const entitlements = entitlementsData?.entitlements
  // The conversational assistant answers account-wide questions; the legacy
  // reorder "ask" endpoint only ever matched product names in the suggestion list.
  const assistantAvailable = isEntitlementFeatureEnabled(entitlements, 'ai_assistant')
  const aiUsageSummary = entitlements?.aiUsage
  const aiRequestLimit = aiUsageSummary?.limit ?? entitlements?.limits?.ai_requests_per_day ?? 0
  const aiRequestUsage = aiUsageSummary?.current ?? entitlements?.usage?.ai_requests_per_day ?? 0
  const showAiUsageMeter =
    (canExplainLlm || canAskLlm) && typeof aiRequestLimit === 'number' && aiRequestLimit > 0
  const aiUsageMeter = showAiUsageMeter
    ? getUsageMeterDisplay(aiRequestUsage, aiRequestLimit)
    : null
  const aiUsageWarning = (aiUsageMeter?.pct ?? 0) >= 80 && !aiUsageMeter?.atCap
  const aiUsageAtCap = aiUsageMeter?.atCap === true
  const aiUsagePeriodLabel = aiUsageSummary?.trialPool ? 'this trial' : 'today'
  const aiUsageLimitTitle = aiUsageSummary?.trialPool
    ? 'Trial AI assist limit reached'
    : 'Daily AI assist limit reached'

  const productIdsKey = useMemo(
    () =>
      suggestions
        .filter((s) => s.productId && ['URGENT', 'HIGH', 'MEDIUM'].includes(s.urgency))
        .slice(0, 8)
        .map((s) => String(s.productId))
        .join(','),
    [suggestions]
  )

  const handleAiReview = async () => {
    if (!canExplainLlm || !productIdsKey || isAiRecommending) return
    try {
      const result = await aiRecommend({ productIds: productIdsKey.split(','), limit: 8 }).unwrap()
      setRecommendationsByProduct(
        Object.fromEntries(
          (result.recommendations || []).map((rec) => [String(rec.productId), rec])
        )
      )
      if (result.usageLimited) toast.message(t('toast.aiDailyLimitReached'))
    } catch {
      toast.error(t('guidance.aiFailed'))
    }
  }

  const handleSnooze = async (item: (typeof suggestions)[0]) => {
    try {
      await suppressSuggestion({
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        action: 'snooze',
        snoozeDays: 7,
      }).unwrap()
      toast.success(t('toast.reorderReminderSnoozed'))
    } catch (e: any) {
      toast.error(e?.data?.error?.message || t('toast.reorderSnoozeFailed'))
    }
  }

  const handleNotNeeded = async (item: (typeof suggestions)[0]) => {
    try {
      await suppressSuggestion({
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        action: 'not_needed',
      }).unwrap()
      const rec = item.productId ? recommendationsByProduct[String(item.productId)] : undefined
      if (item.productId && rec) {
        try {
          await sendFeedback({
            productId: String(item.productId),
            source: rec.source,
            actionTaken: 'not_needed',
            recommendedQuantity: rec.recommendedQuantity,
          }).unwrap()
        } catch {
          // Suppress still succeeded — feedback is best-effort
        }
      }
      toast.success(t('toast.reorderMarkedNotNeeded'))
    } catch (e: any) {
      toast.error(e?.data?.error?.message || t('toast.reorderUpdatePreferenceFailed'))
    }
  }

  const handleRecommendationIncorrect = async (item: (typeof suggestions)[0]) => {
    if (!item.productId) return
    const rec = recommendationsByProduct[String(item.productId)]
    try {
      await sendFeedback({
        productId: String(item.productId),
        source: rec?.source || 'forecast',
        actionTaken: 'incorrect',
        recommendedQuantity: rec?.recommendedQuantity ?? item.suggestedQty,
        feedbackReason: 'user_marked_incorrect',
      }).unwrap()
      toast.success(t('toastMessages.recommendationFeedbackRecorded'))
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Could not send feedback')
    }
  }

  const handleAddToQuickList = async (item: (typeof suggestions)[0]) => {
    if (lists.length === 0) {
      toast.error(t('toast.createOrderingListFirst'))
      return
    }
    if (!selectedList) {
      toast.error(t('toast.chooseOrderingList', { defaultValue: 'Choose an ordering list first.' }))
      return
    }
    if (!item.productId) {
      toast.error(t('toast.noProductLinkedToSuggestion'))
      return
    }
    setBusyId(item.id)
    try {
      const rec = recommendationsByProduct[String(item.productId)]
      const qty = resolveQty(item, rec)
      if (qty <= 0) {
        toast.message(t('guidance.reviewBeforeOrdering'))
        return
      }
      await addItemToQuickList({
        quickListId: selectedList.id,
        body: {
          productId: item.productId,
          supplierId: rec?.supplierId || item.supplierId,
          quantity: qty,
        },
      }).unwrap()
      toast.success(t('toast.addedToList', { listName: selectedList.name }))
    } catch (e: any) {
      toast.error(e?.data?.error?.message || t('toast.addToListFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleExplain = async () => {
    try {
      const result = await explainAssistance({}).unwrap()
      setExplainResult(result)
      setExplainOpen(true)
      if (result.usageLimited) {
        toast.message(t('toast.aiDailyLimitReached'))
      }
    } catch (e: any) {
      toast.error(e?.data?.error?.message || t('toast.explainSuggestionsFailed'))
    }
  }

  const handleAsk = async () => {
    const q = askQuery.trim()
    if (!q || aiUsageAtCap) return

    if (assistantAvailable) {
      try {
        const res = await askAssistant({
          conversationId: assistantConversationId.current,
          message: q,
        }).unwrap()
        assistantConversationId.current = res.conversationId
        setAnswer({ question: q, reply: res.reply })
        setAnswerOpen(true)
        setAskQuery('')
      } catch (e: any) {
        toast.error(e?.data?.error?.message || t('toast.parseRequestFailed'))
      }
      return
    }

    try {
      const result = await askAssistance({ query: q }).unwrap()
      if (result.usageLimited) {
        toast.message(t('toast.aiDailyLimitReached'))
      }
      if (result.matchedProducts.length === 0) {
        toast.message(result.clarifyingQuestion || t('toast.noMatchingProducts'))
        return
      }
      setAskResult(result)
      setAskOpen(true)
      setAskQuery('')
    } catch (e: any) {
      toast.error(e?.data?.error?.message || t('toast.parseRequestFailed'))
    }
  }

  const handleAskAddToList = async (match: ReorderAiAskResult['matchedProducts'][0]) => {
    if (lists.length === 0) {
      toast.error(t('toast.createOrderingListFirst'))
      return
    }
    if (!selectedList) {
      toast.error(t('toast.chooseOrderingList', { defaultValue: 'Choose an ordering list first.' }))
      return
    }
    const suggestion = suggestions.find((s) => s.productId === match.productId)
    setAskBusyProductId(match.productId)
    try {
      await addItemToQuickList({
        quickListId: selectedList.id,
        body: {
          productId: match.productId,
          supplierId: suggestion?.supplierId,
          quantity:
            Number.isFinite(Number(match.qty)) && Number(match.qty) > 0 ? Number(match.qty) : 1,
        },
      }).unwrap()
      toast.success(t('toast.addedToList', { listName: selectedList.name }))
    } catch (e: any) {
      toast.error(e?.data?.error?.message || t('toast.addToListFailed'))
    } finally {
      setAskBusyProductId(null)
    }
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className={compact ? 'pb-2' : undefined}>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className={className}>
        <CardContent className="py-6">
          <EmptyState
            title="Could not load reorder suggestions"
            description="Try again in a moment."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={className} data-testid="reorder-assistance-panel">
        <CardHeader className={compact ? 'pb-2' : undefined}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-[var(--brand-mid)]" />
                {t('guidance.title')}
              </CardTitle>
              {!compact && (
                <CardDescription>
                  {t('guidance.description')}
                  {isAiRecommending ? ` · ${t('guidance.aiLoading')}` : ''}
                </CardDescription>
              )}
            </div>
            {compact && suggestions.length > (maxItems ?? 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  document
                    .getElementById('reorder-assistance')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                {t('guidance.viewAll')}
              </Button>
            )}
          </div>
          {!compact && (
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="reorder-search">{t('guidance.search')}</Label>
                <Input
                  id="reorder-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="reorder-status">{t('guidance.status')}</Label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger id="reorder-status">
                    <option value="all">{t('guidance.all')}</option>
                    {['order', 'wait', 'manual_review'].map((action) => (
                      <option key={action} value={action}>
                        {t(`guidance.actions.${action}`)}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
              <div>
                <Label htmlFor="reorder-supplier">{t('guidance.supplier')}</Label>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger id="reorder-supplier">
                    <option value="all">{t('guidance.allSuppliers')}</option>
                    {Array.from(
                      new Map<string, string>(
                        suggestions
                          .filter((item) => item.supplierId)
                          .map(
                            (item) =>
                              [item.supplierId!, item.supplierName || item.supplierId!] as [
                                string,
                                string,
                              ]
                          )
                      ).entries()
                    ).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isFetching}
              onClick={() => {
                setRecommendationsByProduct({})
                void refetch()
              }}
            >
              <RefreshCw className="me-1 h-3.5 w-3.5" />
              {t('guidance.refresh')}
            </Button>
            {canExplainLlm && (
              <Button
                size="sm"
                variant="outline"
                disabled={isAiRecommending || !productIdsKey || aiUsageAtCap}
                onClick={() => void handleAiReview()}
              >
                <Sparkles className="me-1 h-3.5 w-3.5" />
                {t('guidance.aiReview')}
              </Button>
            )}
            <span className="text-xs text-[var(--text-muted)]">
              {t('guidance.showing', {
                count: visible.length,
                total: data?.total || suggestions.length,
              })}
            </span>
          </div>
          {lists.length > 1 && (
            <div className="mt-3 max-w-sm min-w-0 space-y-1.5">
              <Label htmlFor={compact ? 'reorder-list-compact' : 'reorder-list'}>
                {t('reorderList.label', { defaultValue: 'Ordering list' })}
              </Label>
              <Select value={selectedList?.id ?? ''} onValueChange={setSelectedListId}>
                <SelectTrigger id={compact ? 'reorder-list-compact' : 'reorder-list'}>
                  <option value="">
                    {t('reorderList.choose', { defaultValue: 'Choose an ordering list' })}
                  </option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
          )}
          {(canExplain || canAsk) && !compact && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              {canExplain && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExplaining || suggestions.length === 0}
                  onClick={handleExplain}
                  title={
                    canExplainLlm ? undefined : 'AI assistant is off — showing rule-based summary'
                  }
                >
                  {isExplaining ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <HelpCircle className="h-3.5 w-3.5 mr-1" />
                  )}
                  {t('guidance.why')}
                </Button>
              )}
              {(assistantAvailable || canAsk) && (
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="flex gap-2">
                    <Input
                      placeholder={
                        assistantAvailable
                          ? t('guidance.askPlaceholder')
                          : t('guidance.keywordPlaceholder')
                      }
                      value={askQuery}
                      onChange={(e) => setAskQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                      className="h-8 text-sm"
                      disabled={aiUsageAtCap}
                      title={
                        assistantAvailable || canAskLlm
                          ? aiUsageAtCap
                            ? aiUsageLimitTitle
                            : undefined
                          : 'AI assistant is off — matching product names by keywords'
                      }
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        isAsking || isAssistantAnswering || !askQuery.trim() || aiUsageAtCap
                      }
                      onClick={handleAsk}
                      aria-label={t('guidance.ask')}
                      title={aiUsageAtCap ? aiUsageLimitTitle : undefined}
                    >
                      {isAsking || isAssistantAnswering ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MessageSquare className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                  {!assistantAvailable && !canAskLlm && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Keyword matching only — enable AI platform for purchase-language assist
                    </p>
                  )}
                </div>
              )}
              {showAiUsageMeter && aiUsageMeter && (
                <p
                  className={cn(
                    'text-xs',
                    aiUsageAtCap
                      ? 'text-amber-700 font-medium'
                      : aiUsageWarning
                        ? 'text-amber-600'
                        : 'text-[var(--text-muted)]'
                  )}
                >
                  {aiUsageMeter.display}/{aiUsageMeter.limit} AI assists {aiUsagePeriodLabel}
                  {aiUsageAtCap ? ' - limit reached' : ''}
                </p>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">
              {t(
                search || actionFilter !== 'all' || supplierFilter !== 'all'
                  ? 'guidance.noMatches'
                  : 'guidance.empty'
              )}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--app-border)]">
              {visible.map((item) => {
                const forecast = resolveItemForecast(item, forecasts)
                const rec = item.productId
                  ? recommendationsByProduct[String(item.productId)]
                  : undefined
                const qty = resolveQty(item, rec)
                const showForecastBadges =
                  !rec && (item.reasonCode === 'forecast' || forecast?.confidence != null)
                const confidenceLabel = item.dataQuality
                  ? t(`guidance.quality.${item.dataQuality}`)
                  : formatForecastConfidence(rec?.confidence ?? forecast?.confidence)
                const reorderByLabel = formatReorderByDate(
                  item.action
                    ? item.action === 'order'
                      ? item.orderBy
                      : null
                    : forecast?.reorderByDate
                )
                const actionable =
                  canOrder && qty > 0 && item.action !== 'manual_review' && item.action !== 'wait'
                const sourceLabel = rec
                  ? recommendationLabel(rec.source)
                  : canExplainLlm && item.productId
                    ? null
                    : item.productId
                      ? 'Forecast Reorder Recommendation'
                      : null

                return (
                  <li
                    key={item.id}
                    className="py-3 first:pt-0 last:pb-0"
                    data-testid="reorder-item"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm text-[var(--text)] truncate">
                            {item.productName || item.productId || item.id}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              URGENCY_STYLES[rec?.priority || item.urgency] || URGENCY_STYLES.LOW
                            )}
                          >
                            {rec?.priority || item.urgency}
                          </Badge>
                          {sourceLabel && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                rec?.source === 'ai'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-violet-50 text-violet-800 border-violet-200'
                              )}
                              data-testid="recommendation-source-label"
                            >
                              {sourceLabel}
                            </Badge>
                          )}
                          {confidenceLabel && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-violet-50 text-violet-800 border-violet-200"
                            >
                              {confidenceLabel}
                            </Badge>
                          )}
                          {(showForecastBadges || rec?.deliveryDate) && reorderByLabel && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-violet-50 text-violet-700 border-violet-100"
                            >
                              {t('guidance.orderBy')}: {reorderByLabel}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex rounded px-1.5 py-0.5 text-xs font-medium',
                              REASON_STYLES[item.reasonCode] || REASON_STYLES.not_ordered_recently
                            )}
                          >
                            {item.reasonLabel}
                          </span>
                          {(rec?.supplierName || item.supplierName) && (
                            <span className="text-xs text-[var(--text-muted)]">
                              {rec?.supplierName || item.supplierName}
                            </span>
                          )}
                          <span className="text-xs text-[var(--text-muted)]">
                            {t('guidance.suggested')}: {item.action === 'manual_review' ? '—' : qty}
                            {item.productUnit ? ` ${item.productUnit}` : ''}
                            {getAction(item)
                              ? ` · ${t(`guidance.actions.${getAction(item)}`)}`
                              : ''}
                          </span>
                        </div>
                        {item.currentQty != null && (
                          <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--bg)] p-3 text-xs sm:grid-cols-4">
                            {(
                              [
                                ['onHand', item.currentQty],
                                ['incoming', item.incomingQty],
                                ['expectedUsage', item.expectedUsage],
                                ['netNeed', item.netNeed],
                              ] as const
                            ).map(([label, value]) => (
                              <div key={label}>
                                <dt className="text-[var(--text-muted)]">
                                  {t(`guidance.${label}`)}
                                </dt>
                                <dd className="mt-1 font-medium">
                                  {value == null
                                    ? t('guidance.unknown')
                                    : new Intl.NumberFormat(i18n.language, {
                                        maximumFractionDigits: 3,
                                      }).format(value)}
                                  {value != null ? ` ${item.productUnit || ''}` : ''}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {item.stockScope && (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {t(`guidance.scope.${item.stockScope}`)}
                          </p>
                        )}
                        {item.warnings?.map((warning) => (
                          <p key={warning} className="mt-1 text-xs text-amber-800">
                            {t(`guidance.warnings.${warning}`, { defaultValue: warning })}
                          </p>
                        ))}
                        {rec?.summary && (
                          <p className="mt-1.5 text-xs text-[var(--text)]">{rec.summary}</p>
                        )}
                        {rec?.reasoning && rec.reasoning.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-xs text-[var(--text-muted)]">
                            {rec.reasoning.slice(0, 4).map((reason, idx) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        )}
                        {rec?.warnings && rec.warnings.length > 0 && (
                          <ul className="mt-1 text-xs text-amber-700">
                            {rec.warnings.slice(0, 3).map((warning, idx) => (
                              <li key={idx}>{warning}</li>
                            ))}
                          </ul>
                        )}
                        {rec?.alternatives && rec.alternatives.length > 0 && (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Alternatives:{' '}
                            {rec.alternatives
                              .map(
                                (a) =>
                                  a.rationale ||
                                  (a.recommendedQuantity != null
                                    ? `qty ${a.recommendedQuantity}`
                                    : null)
                              )
                              .filter(Boolean)
                              .join('; ')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 shrink-0">
                        {item.productId && (
                          <>
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/app/products/${item.productId}`}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                {t('guidance.view')}
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === item.id || !actionable}
                              onClick={() => handleAddToQuickList(item)}
                            >
                              {busyId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <ListPlus className="h-3.5 w-3.5 mr-1" />
                                  {t('guidance.list')}
                                </>
                              )}
                            </Button>
                            {actionable ? (
                              <Button variant="default" size="sm" asChild>
                                <Link
                                  to={`/app/products/${item.productId}`}
                                  state={{ addToCartQty: qty }}
                                >
                                  <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                                  {t('guidance.cart')}
                                </Link>
                              </Button>
                            ) : (
                              <Button size="sm" disabled>
                                {t(
                                  `guidance.actions.${item.action || rec?.action || 'manual_review'}`
                                )}
                              </Button>
                            )}
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSuppressing || !canManage}
                          onClick={() => handleSnooze(item)}
                          title={t('guidance.snooze')}
                          aria-label={t('guidance.snooze')}
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSuppressing || !canManage}
                          onClick={() => handleNotNeeded(item)}
                          title={t('guidance.notNeeded')}
                          aria-label={t('guidance.notNeeded')}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                        {item.productId && (rec || !canExplainLlm) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRecommendationIncorrect(item)}
                            title={t('guidance.incorrect')}
                            aria-label={t('guidance.incorrect')}
                          >
                            <Flag className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={answerOpen} onOpenChange={setAnswerOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Assistant</DialogTitle>
            <DialogDescription>{answer?.question}</DialogDescription>
          </DialogHeader>
          {answer && <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer.reply}</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Matched products</DialogTitle>
            <DialogDescription>
              Review quantities before adding to your ordering list.
            </DialogDescription>
          </DialogHeader>
          {askResult && (
            <ul className="space-y-3">
              {askResult.matchedProducts.map((match) => (
                <li
                  key={match.productId}
                  className="rounded-md border border-[var(--app-border)] p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">
                        {match.productName ||
                          suggestions.find((s) => s.productId === match.productId)?.productName ||
                          'Product'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Suggested qty: {match.qty}
                        {match.confidence != null &&
                          ` · ${formatForecastConfidence(match.confidence)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={askBusyProductId === match.productId}
                      onClick={() => handleAskAddToList(match)}
                    >
                      {askBusyProductId === match.productId ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ListPlus className="h-3.5 w-3.5 mr-1" />
                      )}
                      Add to list
                    </Button>
                    <Button variant="default" size="sm" asChild>
                      <Link to={`/app/products/${match.productId}`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        View product
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Why these suggestions?</DialogTitle>
            <DialogDescription>
              {explainResult?.source === 'llm'
                ? 'AI summary based on your inventory signals'
                : 'Rule-based summary from inventory rules and forecasts'}
            </DialogDescription>
          </DialogHeader>
          {explainResult && (
            <div className="space-y-4 text-sm">
              <p className="text-[var(--text)]">{explainResult.summary}</p>
              {explainResult.items.length > 0 && (
                <ul className="space-y-2">
                  {explainResult.items.map((item) => {
                    const product = suggestions.find((s) => s.productId === item.productId)
                    return (
                      <li
                        key={item.productId}
                        className="rounded-md border border-[var(--app-border)] p-2"
                      >
                        <p className="font-medium">{product?.productName || item.productId}</p>
                        <p className="text-[var(--text-muted)] mt-0.5">{item.rationale}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
