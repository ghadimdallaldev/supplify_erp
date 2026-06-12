import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { Textarea } from '../ui/textarea'
import {
  useGetOrderFulfillmentIssuesQuery,
  useReportOrderShortageMutation,
  useSuggestOrderSubstitutionIssueMutation,
  useOpenOrderFulfillmentChatMutation,
} from '../../services/api'
import { toast } from 'sonner'
import { MessageSquare, AlertTriangle } from 'lucide-react'

type OrderItem = {
  id: string
  product_name?: string
  quantity?: number
  unit?: string
}

export function SupplierFulfillmentIssuePanel({
  orderId,
  items,
}: {
  orderId: string
  items: OrderItem[]
}) {
  const { data, refetch } = useGetOrderFulfillmentIssuesQuery(orderId)
  const [reportShortage, { isLoading: reporting }] = useReportOrderShortageMutation()
  const [suggestSub, { isLoading: suggesting }] = useSuggestOrderSubstitutionIssueMutation()
  const [openChat, { isLoading: openingChat }] = useOpenOrderFulfillmentChatMutation()

  const [orderItemId, setOrderItemId] = useState(items[0]?.id || '')
  const [shortageQty, setShortageQty] = useState('')
  const [availableQty, setAvailableQty] = useState('')
  const [replacementQty, setReplacementQty] = useState('')
  const [replacementUnit, setReplacementUnit] = useState('')
  const [message, setMessage] = useState('')

  const selectedItem = items.find((i) => i.id === orderItemId)
  const issues = data?.issues || []
  const busy = reporting || suggesting || openingChat

  const runAction = async (
    action: 'shortage' | 'substitution' | 'chat',
    conversationId?: string
  ) => {
    if (!orderItemId) {
      toast.error('Select an order line')
      return
    }
    const body = {
      orderItemId,
      shortageQuantity: shortageQty ? parseFloat(shortageQty) : undefined,
      availableQuantity: availableQty ? parseFloat(availableQty) : undefined,
      replacementQuantity: replacementQty ? parseFloat(replacementQty) : undefined,
      replacementUnit: replacementUnit || selectedItem?.unit,
      message: message.trim() || undefined,
    }
    try {
      let result: { conversation?: { id: string } } | undefined
      if (action === 'shortage') {
        result = await reportShortage({ orderId, body }).unwrap()
      } else if (action === 'substitution') {
        result = await suggestSub({ orderId, body }).unwrap()
      } else {
        result = await openChat({ orderId, body }).unwrap()
      }
      toast.success('Message sent to restaurant')
      refetch()
      const convId = result?.conversation?.id || conversationId
      if (convId) {
        window.location.assign(`/app/chat?conversation=${convId}`)
      }
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Could not send')
    }
  }

  if (!items.length) return null

  return (
    <div
      className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3.5"
      data-testid="supplier-fulfillment-issue-panel"
    >
      <h3 className="text-sm font-extrabold mb-1 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        Shortage & substitution
      </h3>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        Report shortages or open a structured chat. The restaurant must accept before order lines
        change.
      </p>

      {issues.length > 0 && (
        <div className="mb-3 text-xs bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          {issues.length} open issue(s) on this order.
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Affected line</Label>
          <Select value={orderItemId} onValueChange={setOrderItemId}>
            <SelectTrigger className="mt-1">
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.product_name} ({item.quantity} {item.unit || 'unit'})
                </option>
              ))}
            </SelectTrigger>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Shortage qty</Label>
            <Input value={shortageQty} onChange={(e) => setShortageQty(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Available qty</Label>
            <Input value={availableQty} onChange={(e) => setAvailableQty(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Replacement qty</Label>
            <Input value={replacementQty} onChange={(e) => setReplacementQty(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Replacement unit</Label>
            <Input
              value={replacementUnit}
              placeholder={selectedItem?.unit || 'unit'}
              onChange={(e) => setReplacementUnit(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Note (optional)</Label>
          <Textarea
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Additional context for the restaurant"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            data-testid="report-shortage-btn"
            onClick={() => runAction('shortage')}
          >
            Report shortage
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            data-testid="suggest-substitution-btn"
            onClick={() => runAction('substitution')}
          >
            Suggest substitution
          </Button>
          <Button
            size="sm"
            disabled={busy}
            data-testid="open-fulfillment-chat-btn"
            onClick={() => runAction('chat')}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1" />
            Open chat
          </Button>
        </div>
      </div>

      {issues[0]?.conversation_id && (
        <p className="mt-3 text-xs">
          <Link
            to={`/app/chat?conversation=${issues[0].conversation_id}`}
            className="text-[var(--brand)] font-semibold"
          >
            View conversation →
          </Link>
        </p>
      )}
    </div>
  )
}
