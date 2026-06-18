import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Download, FileUp, Upload } from 'lucide-react'
import {
  useImportRestaurantInventoryMutation,
  usePreviewRestaurantInventoryImportMutation,
  INVENTORY_IMPORT_CSV_TEMPLATE,
  type RestaurantInventoryImportPreview,
} from '../../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Label } from '../../ui/label'
import { LimitExceededBanner } from '../../LimitExceededBanner'
import { cn } from '../../../lib/utils'
import { ensureNamespace } from '../../../i18n'

type InventoryBulkImportPanelProps = {
  onImported: () => void
  embedded?: boolean
}

export function InventoryBulkImportPanel({
  onImported,
  embedded = false,
}: InventoryBulkImportPanelProps) {
  const { t } = useTranslation('inventory')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<RestaurantInventoryImportPreview | null>(null)

  const [previewImport, { isLoading: previewing }] = usePreviewRestaurantInventoryImportMutation()
  const [runImport, { isLoading: importing }] = useImportRestaurantInventoryMutation()

  useEffect(() => {
    void ensureNamespace('inventory')
  }, [])

  const handleDownloadTemplate = () => {
    const blob = new Blob([INVENTORY_IMPORT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'inventory-import-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)
    setPreview(null)
    event.target.value = ''
  }

  const handlePreview = async () => {
    if (!csvText.trim()) {
      toast.error(t('bulkImportPanel.pasteOrUploadFirst'))
      return
    }
    try {
      const result = await previewImport({ csv: csvText }).unwrap()
      setPreview(result)
      if (result.limitWarning) {
        toast.error(t('bulkImportPanel.limitExceeded'))
      } else if (result.errorCount > 0) {
        toast.error(t('bulkImportPanel.rowsNeedFixes', { count: result.errorCount }))
      } else {
        toast.success(t('bulkImportPanel.rowsReady', { count: result.validCount }))
      }
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('bulkImportPanel.previewFailed'))
    }
  }

  const handleImport = async () => {
    if (!csvText.trim()) {
      toast.error(t('bulkImportPanel.pasteOrUploadFirst'))
      return
    }
    if (preview?.limitWarning) {
      toast.error(t('bulkImportPanel.fixLimitBeforeImport'))
      return
    }
    try {
      const result = await runImport({ csv: csvText }).unwrap()
      const { summary } = result
      toast.success(
        t('bulkImportPanel.importSuccess', {
          added: summary.added,
          updatedSuffix: summary.updated
            ? t('bulkImportPanel.importSuccessUpdated', { count: summary.updated })
            : '',
        })
      )
      if (summary.failed) {
        toast.error(t('bulkImportPanel.rowsFailed', { count: summary.failed }))
      }
      setCsvText('')
      setPreview(null)
      onImported()
    } catch (error: unknown) {
      const err = error as { data?: { error?: { name?: string; message?: string } } }
      const message = err?.data?.error?.message || t('bulkImportPanel.importFailed')
      if (err?.data?.error?.name === 'LIMIT_EXCEEDED') {
        toast.error(message, { duration: 6000 })
      } else {
        toast.error(message)
      }
    }
  }

  const content = (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 text-xs text-[var(--text-mid)]">
        <p className="font-medium text-[var(--text)]">{t('bulkImportPanel.columnsTitle')}</p>
        <p className="mt-1 font-mono text-[11px] leading-relaxed">
          {t('bulkImportPanel.columnsHint')}
        </p>
        <p className="mt-2 text-[var(--text-muted)]">{t('bulkImportPanel.columnsHelp')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden />
          {t('bulkImportPanel.downloadTemplate')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="mr-1.5 h-4 w-4" aria-hidden />
          {t('bulkImportPanel.uploadCsv')}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="inventoryImportCsv">{t('bulkImportPanel.pasteCsv')}</Label>
        <textarea
          id="inventoryImportCsv"
          className="min-h-[140px] w-full rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]"
          placeholder={INVENTORY_IMPORT_CSV_TEMPLATE.split('\n').slice(0, 3).join('\n')}
          value={csvText}
          onChange={(event) => {
            setCsvText(event.target.value)
            setPreview(null)
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={handlePreview} disabled={previewing}>
          {previewing ? t('bulkImportPanel.checking') : t('bulkImportPanel.previewRows')}
        </Button>
        <Button
          type="button"
          onClick={handleImport}
          disabled={importing || !csvText.trim() || Boolean(preview?.limitWarning)}
          className="bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
        >
          <Upload className="mr-1.5 h-4 w-4" aria-hidden />
          {importing ? t('bulkImportPanel.importing') : t('bulkImportPanel.importInventory')}
        </Button>
      </div>

      {preview?.limitWarning ? (
        <LimitExceededBanner
          limitKey={preview.limitWarning.meter}
          currentUsage={preview.limitWarning.current}
          limitValue={preview.limitWarning.limit}
        />
      ) : null}

      {preview ? (
        <div className="overflow-hidden rounded-lg border border-[var(--app-border)]">
          <div className="flex flex-wrap gap-3 border-b border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2 text-xs text-[var(--text-muted)]">
            <span>{t('bulkImportPanel.rowSummary', { count: preview.totalRows })}</span>
            <span className="text-[var(--mint)]">
              {t('bulkImportPanel.valid', { count: preview.validCount })}
            </span>
            {preview.newSkuCount > 0 ? (
              <span>{t('bulkImportPanel.newSkus', { count: preview.newSkuCount })}</span>
            ) : null}
            {preview.errorCount > 0 ? (
              <span className="text-[var(--red)]">
                {t('bulkImportPanel.errors', { count: preview.errorCount })}
              </span>
            ) : null}
          </div>
          <ul className="max-h-56 divide-y divide-[var(--app-border)] overflow-y-auto">
            {preview.preview.map((row) => (
              <li
                key={row.rowNumber}
                className={cn(
                  'px-3 py-2 text-xs',
                  row.status === 'error' && 'bg-[var(--red-pale)]/40'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-[var(--text)]">
                    {t('bulkImportPanel.rowLabel', {
                      number: row.rowNumber,
                      name: String(row.mapped.productName || row.mapped.sku || '—'),
                    })}
                  </span>
                  <span
                    className={cn(
                      row.status === 'valid' ? 'text-[var(--mint)]' : 'text-[var(--red)]'
                    )}
                  >
                    {row.status}
                  </span>
                </div>
                {row.status === 'valid' ? (
                  <p className="mt-0.5 text-[var(--text-muted)]">
                    {t('bulkImportPanel.rowValidDetail', {
                      sku: String(row.mapped.sku),
                      quantity: String(row.mapped.quantity),
                      skuStatus: row.isNewSku
                        ? t('bulkImportPanel.newSkuBadge')
                        : t('bulkImportPanel.existingBadge'),
                    })}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[var(--red)]">
                    {row.errors.map((e) => e.message).join('; ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )

  if (embedded) {
    return content
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('bulkImportPanel.title')}</CardTitle>
        <CardDescription>{t('bulkImportPanel.description')}</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}

export default InventoryBulkImportPanel
