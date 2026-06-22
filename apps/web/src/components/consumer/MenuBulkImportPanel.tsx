import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Download, FileUp, Upload } from 'lucide-react'
import {
  useImportConsumerMenuMutation,
  usePreviewConsumerMenuImportMutation,
  MENU_IMPORT_CSV_TEMPLATE,
} from '../../services/consumerApi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { cn } from '../../lib/utils'
import { ensureNamespace } from '../../i18n'

type PreviewRow = {
  rowNumber: number
  status: 'valid' | 'error'
  mapped: Record<string, unknown>
  errors: Array<{ field: string; message: string }>
}

type MenuBulkImportPanelProps = {
  onImported: () => void
}

export function MenuBulkImportPanel({ onImported }: MenuBulkImportPanelProps) {
  const { t } = useTranslation('consumer')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvText, setCsvText] = useState('')
  const [updateExisting, setUpdateExisting] = useState(true)
  const [preview, setPreview] = useState<{
    totalRows: number
    validCount: number
    errorCount: number
    preview: PreviewRow[]
  } | null>(null)

  const [previewImport, { isLoading: previewing }] = usePreviewConsumerMenuImportMutation()
  const [runImport, { isLoading: importing }] = useImportConsumerMenuMutation()

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  const handleDownloadTemplate = () => {
    const blob = new Blob([MENU_IMPORT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'menu-import-template.csv'
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
      toast.error(t('menuBulkImport.toast.pasteOrUploadFirst'))
      return
    }
    try {
      const result = await previewImport({ csv: csvText }).unwrap()
      setPreview(result)
      if (result.errorCount > 0) {
        toast.error(t('menuBulkImport.toast.rowsNeedFixes', { count: result.errorCount }))
      } else {
        toast.success(t('menuBulkImport.toast.rowsReady', { count: result.validCount }))
      }
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('menuBulkImport.toast.previewFailed'))
    }
  }

  const handleImport = async () => {
    if (!csvText.trim()) {
      toast.error(t('menuBulkImport.toast.pasteOrUploadFirst'))
      return
    }
    try {
      const result = await runImport({ csv: csvText, updateExisting }).unwrap()
      const { summary } = result
      const updated = summary.itemsUpdated
        ? t('menuBulkImport.toast.importSuccessUpdated', { count: summary.itemsUpdated })
        : ''
      const categories = summary.categoriesCreated
        ? t('menuBulkImport.toast.importSuccessCategories', { count: summary.categoriesCreated })
        : ''
      toast.success(
        t('menuBulkImport.toast.importSuccess', {
          created: summary.itemsCreated,
          updated,
          categories,
        })
      )
      if (summary.failed) {
        toast.error(t('menuBulkImport.toast.rowsFailed', { count: summary.failed }))
      }
      setCsvText('')
      setPreview(null)
      onImported()
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('menuBulkImport.toast.importFailed'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk import</CardTitle>
        <CardDescription>
          Upload a CSV to create categories and items in one go. Categories are created
          automatically when they do not exist yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 text-xs text-[var(--text-mid)]">
          <p className="font-medium text-[var(--text)]">CSV columns</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed">
            category, name, price, description, available, image_url
          </p>
          <p className="mt-2 text-[var(--text-muted)]">
            Optional: category_description, sort_order. Use true/false for available. Rows with the
            same category + item name update existing items when enabled below.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleDownloadTemplate}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            Download template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="mr-1.5 h-4 w-4" aria-hidden />
            Upload CSV
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
          <Label htmlFor="menuImportCsv">Paste CSV</Label>
          <textarea
            id="menuImportCsv"
            className="min-h-[140px] w-full rounded-lg border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text)]"
            placeholder={MENU_IMPORT_CSV_TEMPLATE.split('\n').slice(0, 3).join('\n')}
            value={csvText}
            onChange={(event) => {
              setCsvText(event.target.value)
              setPreview(null)
            }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Switch checked={updateExisting} onCheckedChange={setUpdateExisting} />
          Update existing items with the same category and name
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handlePreview} disabled={previewing}>
            {previewing ? 'Checking…' : 'Preview rows'}
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={importing || !csvText.trim()}
            className="bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
          >
            <Upload className="mr-1.5 h-4 w-4" aria-hidden />
            {importing ? 'Importing…' : 'Import menu'}
          </Button>
        </div>

        {preview ? (
          <div className="overflow-hidden rounded-lg border border-[var(--app-border)]">
            <div className="flex flex-wrap gap-3 border-b border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2 text-xs text-[var(--text-muted)]">
              <span>{preview.totalRows} rows</span>
              <span className="text-[var(--mint)]">{preview.validCount} valid</span>
              {preview.errorCount > 0 ? (
                <span className="text-[var(--red)]">{preview.errorCount} errors</span>
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
                      Row {row.rowNumber}: {String(row.mapped.name || '—')}
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
                      {String(row.mapped.category)} · {String(row.mapped.price)}
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
      </CardContent>
    </Card>
  )
}

export default MenuBulkImportPanel
