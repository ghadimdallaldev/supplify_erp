import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useGetReorderAssistanceQuery,
  useSuppressReorderSuggestionMutation,
  useGetQuickListsQuery,
  useAddItemToQuickListMutation,
  useExplainReorderAssistanceMutation,
  useAskReorderAssistanceMutation,
} from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { EmptyState } from '../ui/empty-state'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import type { ReorderAiExplainResult } from '../../types/reorder'

const URGENCY_STYLES: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-800 border-red-200',
  HIGH: 'bg-amber-100 text-amber-900 border-amber-200',
  MEDIUM: 'bg-slate-100 text-slate-800 border-slate-200',
  LOW: 'bg-slate-50 text-slate-600 border-slate-100',
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
  const { data, isLoading, isError, refetch } = useGetReorderAssistanceQuery()
  const { data: quickListsData } = useGetQuickListsQuery()
  const [suppressSuggestion, { isLoading: isSuppressing }] = useSuppressReorderSuggestionMutation()
  const [addItemToQuickList] = useAddItemToQuickListMutation()
  const [explainAssistance, { isLoading: isExplaining }] = useExplainReorderAssistanceMutation()
  const [askAssistance, { isLoading: isAsking }] = useAskReorderAssistanceMutation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainResult, setExplainResult] = useState<ReorderAiExplainResult | null>(null)
  const [askQuery, setAskQuery] = useState('')

  const suggestions = data?.suggestions ?? []
  const visible = maxItems ? suggestions.slice(0, maxItems) : suggestions
  const canExplain = data?.smartReorder?.capabilities?.forecast === true
  const canAsk = data?.smartReorder?.capabilities?.seasonality === true

  const handleSnooze = async (item: (typeof suggestions)[0]) => {
    try {
      await suppressSuggestion({
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        action: 'snooze',
        snoozeDays: 7,
      }).unwrap()
      toast.success('Reminder snoozed for 7 days')
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Could not snooze reminder')
    }
  }

  const handleNotNeeded = async (item: (typeof suggestions)[0]) => {
    try {
      await suppressSuggestion({
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        action: 'not_needed',
      }).unwrap()
      toast.success('Marked as not needed')
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Could not update preference')
    }
  }

  const handleAddToQuickList = async (item: (typeof suggestions)[0]) => {
    const lists = quickListsData?.quickLists || []
    if (lists.length === 0) {
      toast.error('Create an ordering list first')
      return
    }
    if (!item.productId) {
      toast.error('No product linked to this suggestion')
      return
    }
    setBusyId(item.id)
    try {
      const qty = item.suggestedQty ?? 1
      await addItemToQuickList({
        quickListId: lists[0].id,
        body: {
          productId: item.productId,
          supplierId: item.supplierId,
          quantity: qty,
        },
      }).unwrap()
      toast.success(`Added to ${lists[0].name}`)
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Failed to add to list')
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
        toast.message('Daily AI limit reached — showing rule-based summary')
      }
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Could not explain suggestions')
    }
  }

  const handleAsk = async () => {
    const q = askQuery.trim()
    if (!q) return
    try {
      const result = await askAssistance({ query: q }).unwrap()
      if (result.matchedProducts.length === 0) {
        toast.message(result.clarifyingQuestion || 'No matching products found')
        return
      }
      const names = result.matchedProducts
        .map((m) => m.productName || 'item')
        .slice(0, 3)
        .join(', ')
      toast.success(`Matched: ${names} — review and add from suggestions below`)
      setAskQuery('')
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Could not parse your request')
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
                Reorder assistance
              </CardTitle>
              {!compact && (
                <CardDescription>
                  Suggestions based on stock levels, expiry, order patterns, and forecasts
                </CardDescription>
              )}
            </div>
            {compact && suggestions.length > (maxItems ?? 0) && (
              <Button variant="ghost" size="sm" asChild>
                <Link to="/app/inventory#reorder-assistance">View all</Link>
              </Button>
            )}
          </div>
          {(canExplain || canAsk) && !compact && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              {canExplain && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isExplaining || suggestions.length === 0}
                  onClick={handleExplain}
                >
                  {isExplaining ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <HelpCircle className="h-3.5 w-3.5 mr-1" />
                  )}
                  Why these suggestions?
                </Button>
              )}
              {canAsk && (
                <div className="flex flex-1 gap-2">
                  <Input
                    placeholder='Ask: "order more tomatoes for the weekend"'
                    value={askQuery}
                    onChange={(e) => setAskQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isAsking || !askQuery.trim()}
                    onClick={handleAsk}
                  >
                    {isAsking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">
              No reorder suggestions right now
            </p>
          ) : (
            <ul className="divide-y divide-[var(--app-border)]">
              {visible.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm text-[var(--text)] truncate">
                          {item.productName}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            URGENCY_STYLES[item.urgency] || URGENCY_STYLES.LOW
                          )}
                        >
                          {item.urgency}
                        </Badge>
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
                        {item.supplierName && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {item.supplierName}
                          </span>
                        )}
                        {item.suggestedQty != null && (
                          <span className="text-xs text-[var(--text-muted)]">
                            Suggest: {item.suggestedQty}
                            {item.productUnit ? ` ${item.productUnit}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {item.productId && (
                        <>
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/app/products/${item.productId}`}>
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              View
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === item.id}
                            onClick={() => handleAddToQuickList(item)}
                          >
                            {busyId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <ListPlus className="h-3.5 w-3.5 mr-1" />
                                List
                              </>
                            )}
                          </Button>
                          <Button variant="default" size="sm" asChild>
                            <Link
                              to={`/app/products/${item.productId}`}
                              state={{ addToCartQty: item.suggestedQty }}
                            >
                              <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                              Cart
                            </Link>
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSuppressing}
                        onClick={() => handleSnooze(item)}
                        title="Snooze 7 days"
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSuppressing}
                        onClick={() => handleNotNeeded(item)}
                        title="Not needed"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Why these suggestions?</DialogTitle>
            <DialogDescription>
              {explainResult?.source === 'llm'
                ? 'AI summary based on your inventory signals'
                : 'Summary from inventory rules and forecasts'}
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
