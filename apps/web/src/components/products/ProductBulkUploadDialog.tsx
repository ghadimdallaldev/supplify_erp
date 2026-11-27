import { useTranslation, Trans } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { formatNumber } from '../../utils/format'
import { downloadExampleFile } from './productsShared'
import { Select, SelectTrigger } from '../ui/select'
import { localizedName } from '../../lib/categoryLabel'
import type { CategoryDepartment } from '../../types'
import type { ProductImportJob } from '../../services/api/endpoints/catalogImport'

type ProductBulkUploadDialogProps = {
  showBulkUpload: boolean
  setShowBulkUpload: (open: boolean) => void
  uploadedFile: File | null
  setUploadedFile: (f: File | null) => void
  uploadPreview: any[]
  setUploadPreview: (rows: any[]) => void
  importPreviewMeta: { totalRows: number; validCount: number; errorCount: number } | null
  importErrors: Array<{ rowNumber: number; errors: Array<{ field: string; message: string }> }>
  importSummary: { created: number; updated: number; skipped: number; failed: number } | null
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>
  downloadErrorReport: () => void | Promise<void>
  handleBulkSubmit: () => void | Promise<void>
  importing: boolean
  isCreating: boolean
  importJob?: ProductImportJob | null
  importJobActive?: boolean
  /** Platform tree for the per-row category override. */
  departments: CategoryDepartment[]
  /** rowNumber → leaf category id chosen in the preview. */
  categoryOverrides: Record<number, string>
  setCategoryOverride: (rowNumber: number, categoryId: string) => void
}

export function ProductBulkUploadDialog({
  showBulkUpload,
  setShowBulkUpload,
  uploadedFile,
  setUploadedFile,
  uploadPreview,
  setUploadPreview,
  importPreviewMeta,
  importErrors,
  importSummary,
  handleFileUpload,
  downloadErrorReport,
  handleBulkSubmit,
  importing,
  isCreating,
  importJob,
  importJobActive = false,
  departments,
  categoryOverrides,
  setCategoryOverride,
}: ProductBulkUploadDialogProps) {
  const { t, i18n } = useTranslation('products')
  const reviewCount = uploadPreview.filter(
    (row: any) => row.needsReview && !categoryOverrides[row.rowNumber]
  ).length
  const handleOpenChange = (open: boolean) => {
    if (!open && importJobActive) {
      const confirmed = window.confirm(t('bulkUpload.closeWhileRunningConfirm'))
      if (!confirmed) return
    }
    setShowBulkUpload(open)
    if (!open) {
      setUploadedFile(null)
      setUploadPreview([])
    }
  }

  const importBusy = importing || importJobActive

  return (
    <Dialog open={showBulkUpload} onOpenChange={handleOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t('bulkUpload.title')}</DialogTitle>
          <DialogDescription>{t('bulkUpload.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="file-upload">{t('bulkUpload.selectFile')}</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadExampleFile}
                className="flex items-center gap-2"
              >
                {t('bulkUpload.downloadExample')}
              </Button>
            </div>
            <Input
              id="file-upload"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={importBusy}
              className="cursor-pointer"
            />
            <p className="text-sm text-[var(--text-muted)]">{t('bulkUpload.supportedFormats')}</p>
          </div>

          {importPreviewMeta && (
            <div
              data-testid="import-preview-summary"
              className="rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
            >
              <Trans
                i18nKey="bulkUpload.previewSummary"
                ns="products"
                values={{
                  valid: importPreviewMeta.validCount,
                  errors: importPreviewMeta.errorCount,
                  total: importPreviewMeta.totalRows,
                }}
                components={{ strong: <strong /> }}
              />
            </div>
          )}

          {uploadedFile && (
            <div className="space-y-2">
              <Label>{t('bulkUpload.fileLabel', { name: uploadedFile.name })}</Label>
              <p className="text-sm text-[var(--text-muted)]">
                {t('bulkUpload.fileSize', {
                  size: formatNumber(uploadedFile.size / 1024, { maximumFractionDigits: 2 }),
                })}
              </p>
            </div>
          )}

          {importJobActive && importJob && (
            <div className="space-y-3" data-testid="product-import-progress">
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-medium capitalize text-[var(--text)]">
                  {importJob.status}…
                </span>
                {importJob.rowCount != null && (
                  <span>{t('bulkUpload.processingRows', { count: importJob.rowCount })}</span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
                <div className="h-full w-1/3 animate-pulse bg-[var(--brand)]" />
              </div>
              <p className="text-xs text-[var(--text-muted)]">{t('bulkUpload.backgroundHint')}</p>
            </div>
          )}

          {uploadPreview.length > 0 && !importJobActive && (
            <div className="space-y-2">
              <Label>{t('bulkUpload.preview')}</Label>
              {reviewCount > 0 ? (
                <p className="text-xs text-[var(--amber)]">
                  {t('bulkUpload.reviewHint', { count: reviewCount })}
                </p>
              ) : null}
              <div className="border rounded-md overflow-x-auto max-h-64">
                <table className="w-full text-sm" data-testid="import-preview-table">
                  <thead>
                    <tr className="bg-[var(--brand-ultra)] border-b">
                      <th className="px-3 py-2 text-left">{t('bulkUpload.row')}</th>
                      <th className="px-3 py-2 text-left">{t('bulkUpload.status')}</th>
                      <th className="px-3 py-2 text-left">{t('bulkUpload.sku')}</th>
                      <th className="px-3 py-2 text-start">{t('bulkUpload.name')}</th>
                      <th className="px-3 py-2 text-start">{t('bulkUpload.category')}</th>
                      <th className="px-3 py-2 text-start">{t('bulkUpload.shelf')}</th>
                      <th className="px-3 py-2 text-left">{t('bulkUpload.issues')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadPreview.map((row: any) => (
                      <tr
                        key={row.rowNumber}
                        data-testid={`import-row-${row.rowNumber}`}
                        className={row.status === 'valid' ? 'border-b' : 'border-b bg-red-50/50'}
                      >
                        <td className="px-3 py-2">{row.rowNumber}</td>
                        <td className="px-3 py-2 font-medium">{row.status}</td>
                        <td className="px-3 py-2">{row.mapped?.sku ?? '—'}</td>
                        <td className="px-3 py-2">{row.mapped?.name ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Select
                              value={
                                categoryOverrides[row.rowNumber] ?? row.matchedCategoryId ?? ''
                              }
                              onValueChange={(v) => setCategoryOverride(row.rowNumber, v)}
                            >
                              <SelectTrigger
                                aria-label={t('bulkUpload.categoryForRow', { row: row.rowNumber })}
                                className="h-8 min-w-[160px] text-xs"
                              >
                                <option value="" disabled>
                                  {t('form.selectCategory')}
                                </option>
                                {departments.map((dept) => (
                                  <optgroup
                                    key={dept.id}
                                    label={localizedName(dept, i18n.language)}
                                  >
                                    {dept.categories.map((leaf) => (
                                      <option key={leaf.id} value={leaf.id}>
                                        {localizedName(leaf, i18n.language)}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </SelectTrigger>
                            </Select>
                            {row.needsReview && !categoryOverrides[row.rowNumber] ? (
                              <span className="whitespace-nowrap rounded-full bg-[var(--amber-pale)] px-2 py-0.5 text-[11px] font-medium text-[var(--amber)]">
                                {t('bulkUpload.needsReview')}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">{row.shelf || '—'}</td>
                        <td className="px-3 py-2 text-xs text-[var(--red)]">
                          {(row.errors || []).map((e: { message: string }) => e.message).join('; ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(importErrors.length > 0 || (importSummary && importSummary.failed > 0)) && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-[var(--red)]">
                {t('bulkUpload.rowsNeedAttention', {
                  count: importErrors.length || importSummary?.failed || 0,
                })}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="import-download-errors"
                onClick={downloadErrorReport}
              >
                {t('bulkUpload.downloadErrorCsv')}
              </Button>
            </div>
          )}

          {importSummary && (
            <div
              data-testid="import-summary"
              className="text-sm rounded-md bg-[var(--mint-pale)] px-3 py-2"
            >
              {t('bulkUpload.importSummary', {
                created: importSummary.created,
                updated: importSummary.updated,
                failed: importSummary.failed,
              })}
            </div>
          )}

          <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
            <p className="text-sm text-[var(--brand-mid)]">
              <Trans i18nKey="bulkUpload.csvFormatExample" ns="products" />
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={importing}>
            {importJobActive ? t('bulkUpload.close') : t('bulkUpload.cancel')}
          </Button>
          <Button
            onClick={handleBulkSubmit}
            disabled={!uploadedFile || !importPreviewMeta?.validCount || importBusy || isCreating}
            data-testid="import-submit-btn"
          >
            {importing || importJobActive
              ? t('bulkUpload.importing')
              : t('bulkUpload.importValidRows')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
