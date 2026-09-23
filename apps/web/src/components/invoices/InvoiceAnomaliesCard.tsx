import { useTranslation } from 'react-i18next'
import { AlertTriangle, Receipt } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { useGetInvoiceAnomaliesQuery } from '../../services/api/endpoints/priceIntelligence'

export function InvoiceAnomaliesCard() {
  const { t } = useTranslation('invoices')
  const { data, isLoading, isError } = useGetInvoiceAnomaliesQuery({ days: 90 })
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />
  if (isError) return null
  const invoices = data?.invoices ?? []
  return (
    <Card data-testid="invoice-anomalies-card">
      <CardHeader>
        <CardTitle className="flex gap-2">
          <Receipt className="h-4 w-4" />
          {t('anomalies.title')}
        </CardTitle>
        <CardDescription>{t('anomalies.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {invoices.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('anomalies.empty')}</p>
        ) : (
          <ul className="grid gap-3">
            {invoices.map((invoice) => (
              <li key={invoice.invoiceId} className="rounded-lg border p-3">
                <p className="font-medium">
                  {invoice.invoiceNumber} · {invoice.supplierName}
                </p>
                {invoice.lines.map((line) => (
                  <div key={line.invoiceLineId} className="mt-2">
                    <span className="text-sm">{line.description}</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {line.signals.map((signal) => (
                        <Badge key={signal} variant="secondary" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {t(`anomalies.signals.${signal}`)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
