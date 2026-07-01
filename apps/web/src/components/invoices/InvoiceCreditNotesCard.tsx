import { useTranslation } from 'react-i18next'
import { Receipt } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { StatusBadge } from '../ui/status-badge'
import { formatPrice } from '../../utils/format'

type InvoiceCreditNotesCardProps = {
  tenantCreditNotes: Record<string, unknown>[]
}

export function InvoiceCreditNotesCard({ tenantCreditNotes }: InvoiceCreditNotesCardProps) {
  const { t } = useTranslation('invoices')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          {t('creditNotes.title')}
        </CardTitle>
        <CardDescription>{t('creditNotes.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[var(--text-muted)]">
                <th className="py-2">{t('creditNotes.number')}</th>
                <th className="py-2">{t('creditNotes.amount')}</th>
                <th className="py-2">{t('creditNotes.status')}</th>
                <th className="py-2 text-right">{t('creditNotes.action')}</th>
              </tr>
            </thead>
            <tbody>
              {tenantCreditNotes.map((cn: Record<string, unknown>) => (
                <tr key={String(cn.id)} className="border-b border-[var(--app-border)]">
                  <td className="py-2 font-mono text-xs">
                    {String(cn.credit_note_number || cn.id).slice(-12)}
                  </td>
                  <td className="py-2">${formatPrice(Number(cn.amount || 0))}</td>
                  <td className="py-2">
                    <StatusBadge status={String(cn.status || 'available')} />
                  </td>
                  <td className="py-2 text-right text-xs text-[var(--text-muted)]">
                    {t('creditNotes.applyViaPayment')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
