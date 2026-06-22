import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useGetSupplierQuoteRequestDetailQuery,
  useSubmitSupplierQuoteResponseMutation,
} from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { toast } from 'sonner'
import { ArrowLeft, Send } from 'lucide-react'
import { ensureNamespace } from '../i18n'

type LineDraft = {
  quoteRequestItemId: string
  isAvailable: boolean
  unitPrice: string
  quantity: string
  deliveryDate: string
  note: string
}

export function SupplierQuoteResponsePage() {
  const { t } = useTranslation('quotes')

  useEffect(() => {
    void ensureNamespace('quotes')
  }, [])

  const { quoteRequestSupplierId } = useParams<{ quoteRequestSupplierId: string }>()
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useGetSupplierQuoteRequestDetailQuery(
    quoteRequestSupplierId!,
    { skip: !quoteRequestSupplierId }
  )
  const [submitResponse, { isLoading: submitting }] = useSubmitSupplierQuoteResponseMutation()

  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Record<string, LineDraft>>({})

  useEffect(() => {
    if (!data?.items) return
    const initial: Record<string, LineDraft> = {}
    for (const item of data.items) {
      const existing = data.response?.items.find((r) => r.quoteRequestItemId === item.id)
      initial[item.id] = {
        quoteRequestItemId: item.id,
        isAvailable: existing?.isAvailable ?? true,
        unitPrice: existing?.unitPrice != null ? String(existing.unitPrice) : '',
        quantity: existing?.quantity != null ? String(existing.quantity) : String(item.quantity),
        deliveryDate: existing?.deliveryDate?.slice(0, 10) || '',
        note: existing?.note || '',
      }
    }
    setLines(initial)
    setNote(data.response?.note || '')
  }, [data])

  const updateLine = (itemId: string, patch: Partial<LineDraft>) => {
    setLines((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }))
  }

  const handleSubmit = async () => {
    if (!quoteRequestSupplierId || !data) return
    const items = Object.values(lines).map((line) => ({
      quoteRequestItemId: line.quoteRequestItemId,
      isAvailable: line.isAvailable,
      unitPrice: line.unitPrice ? parseFloat(line.unitPrice) : null,
      quantity: line.quantity ? parseFloat(line.quantity) : null,
      deliveryDate: line.deliveryDate || null,
      note: line.note || null,
      currency: 'USD',
    }))

    try {
      await submitResponse({
        quoteRequestSupplierId,
        note: note || undefined,
        items,
      }).unwrap()
      toast.success(t('response.sentSuccess'))
      navigate('/app/quote-requests/supplier')
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('response.sendFailed'))
    }
  }

  if (isLoading) {
    return (
      <PageShell className="space-y-4" data-testid="supplier-quote-response-page">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </PageShell>
    )
  }

  if (isError || !data) {
    return (
      <PageShell data-testid="supplier-quote-response-page">
        <EmptyState
          title={t('response.notFoundTitle')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </PageShell>
    )
  }

  const headerDescription = [
    data.restaurantName,
    data.neededBy ? t('response.neededBy', { date: data.neededBy }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <PageShell className="space-y-6" data-testid="supplier-quote-response-page">
      <PageHeader
        title={t('response.title')}
        description={headerDescription}
        breadcrumb={
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/app/quote-requests/supplier">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('response.backToInbox')}
            </Link>
          </Button>
        }
      />

      {data.quoteRequestNote && (
        <p className="text-sm text-[var(--text)]">{data.quoteRequestNote}</p>
      )}

      <div className="space-y-4">
        {data.items.map((item) => {
          const line = lines[item.id]
          if (!line) return null
          return (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.productName}</CardTitle>
                <CardDescription>
                  {t('response.productLine', {
                    sku: item.productSku,
                    quantity: item.quantity,
                    unit: item.productUnit || '',
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`avail-${item.id}`}
                    checked={line.isAvailable}
                    onChange={(e) => updateLine(item.id, { isAvailable: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor={`avail-${item.id}`}>{t('response.available')}</Label>
                </div>
                <div className="space-y-2">
                  <Label>{t('response.unitPrice')}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(item.id, { unitPrice: e.target.value })}
                    disabled={!line.isAvailable}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('response.quantity')}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity}
                    onChange={(e) => updateLine(item.id, { quantity: e.target.value })}
                    disabled={!line.isAvailable}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('response.deliveryDate')}</Label>
                  <Input
                    type="date"
                    value={line.deliveryDate}
                    onChange={(e) => updateLine(item.id, { deliveryDate: e.target.value })}
                    disabled={!line.isAvailable}
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label>{t('response.lineNoteLabel')}</Label>
                  <Textarea
                    rows={2}
                    value={line.note}
                    onChange={(e) => updateLine(item.id, { note: e.target.value })}
                    placeholder={t('response.lineNotePlaceholder')}
                    disabled={!line.isAvailable}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('response.overallNoteTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('response.overallNotePlaceholder')}
          />
          <Button disabled={submitting} onClick={handleSubmit}>
            <Send className="h-4 w-4 mr-2" />
            {submitting ? t('common.sending') : t('response.sendResponse')}
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  )
}
