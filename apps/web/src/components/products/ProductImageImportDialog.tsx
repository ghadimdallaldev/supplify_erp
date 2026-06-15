import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Switch } from '../ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { formatNumber } from '../../utils/format'
import {
  downloadImageImportReportUrl,
  useCancelImageImportMutation,
  useGetImageImportJobQuery,
  usePresignImageImportMutation,
  usePreviewImageImportMutation,
  useStartImageImportMutation,
  type ImageImportPreviewResponse,
} from '../../services/api'

type ProductImageImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ImportTab = 'zip_sku' | 'zip_mapping' | 'url_csv'

const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'default' | 'warn' | 'muted'
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-[var(--red)]'
      : tone === 'muted'
        ? 'text-[var(--text-muted)]'
        : 'text-[var(--text)]'

  return (
    <div
      className="rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2"
      data-testid={`image-import-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${valueClass}`}>{formatNumber(value)}</p>
    </div>
  )
}

async function uploadToPresignedUrl(presignedUrl: string, file: File) {
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  })
  if (!response.ok) {
    throw new Error('Failed to upload file')
  }
}

function PreviewDetailSection({
  title,
  rows,
  columns,
  testId,
}: {
  title: string
  rows: Array<Record<string, unknown>>
  columns: Array<{ key: string; label: string }>
  testId: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (!rows.length) return null

  return (
    <div className="rounded-md border border-[var(--app-border)]" data-testid={testId}>
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-[var(--bg)]"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span>
          {title} ({rows.length})
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        )}
      </button>
      {expanded && (
        <div className="max-h-40 overflow-x-auto border-t border-[var(--app-border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--brand-ultra)] border-b">
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2 text-left font-medium">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2">
                      {String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ProductImageImportDialog({ open, onOpenChange }: ProductImageImportDialogProps) {
  const [tab, setTab] = useState<ImportTab>('zip_sku')
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [mappingFile, setMappingFile] = useState<File | null>(null)
  const [zipFileKey, setZipFileKey] = useState<string | null>(null)
  const [mappingFileKey, setMappingFileKey] = useState<string | null>(null)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [preview, setPreview] = useState<ImageImportPreviewResponse | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const terminalToastShownRef = useRef<string | null>(null)

  const [presignImageImport] = usePresignImageImportMutation()
  const [previewImageImport, { isLoading: isPreviewing }] = usePreviewImageImportMutation()
  const [startImageImport, { isLoading: isStarting }] = useStartImageImportMutation()
  const [cancelImageImport, { isLoading: isCancelling }] = useCancelImageImportMutation()

  const { data: jobData } = useGetImageImportJobQuery(jobId || '', {
    skip: !jobId,
    pollingInterval: jobId ? 2000 : 0,
    skipPollingIfUnfocused: true,
  })

  const job = jobData?.job
  const isJobTerminal = job ? TERMINAL_JOB_STATUSES.has(job.status) : false
  const isProgressPhase = Boolean(jobId && job && !isJobTerminal)
  const isCompletePhase = Boolean(jobId && job && isJobTerminal)

  const resetState = useCallback(() => {
    setTab('zip_sku')
    setUploadSessionId(null)
    setZipFile(null)
    setMappingFile(null)
    setZipFileKey(null)
    setMappingFileKey(null)
    setReplaceExisting(false)
    setPreview(null)
    setJobId(null)
    setUploading(false)
    terminalToastShownRef.current = null
  }, [])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isProgressPhase) {
      const confirmed = window.confirm(
        'Image import is still running. Close this dialog? The import will continue in the background.'
      )
      if (!confirmed) return
    }
    if (!nextOpen) resetState()
    onOpenChange(nextOpen)
  }

  const ensureUploadSession = () => {
    if (uploadSessionId) return uploadSessionId
    const id = crypto.randomUUID()
    setUploadSessionId(id)
    return id
  }

  const runPreview = async (params: {
    method: 'zip_sku' | 'zip_mapping'
    zipKey: string
    mappingKey?: string
    replace: boolean
  }) => {
    const result = await previewImageImport({
      method: params.method,
      zipFileKey: params.zipKey,
      mappingFileKey: params.mappingKey,
      replaceExisting: params.replace,
    }).unwrap()
    setPreview(result)
    if ((result.summary?.matched ?? 0) === 0) {
      toast.error('No images matched — review the summary below')
    } else {
      toast.success(`Preview ready: ${result.summary.matched} image(s) matched`)
    }
  }

  const uploadImportFile = async (file: File, purpose: 'zip' | 'csv') => {
    const sessionId = ensureUploadSession()
    const presigned = await presignImageImport({
      fileName: file.name,
      fileType: file.type || (purpose === 'zip' ? 'application/zip' : 'text/csv'),
      fileSize: file.size,
      purpose,
      jobId: sessionId,
    }).unwrap()

    const uploadUrl = presigned.presignedUrl || (presigned as { url?: string }).url
    if (!uploadUrl) throw new Error('Missing upload URL from server')
    await uploadToPresignedUrl(uploadUrl, file)
    return presigned.fileKey
  }

  const handleZipChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Please upload a .zip file')
      return
    }

    setZipFile(file)
    setPreview(null)
    setJobId(null)
    setUploading(true)

    try {
      const key = await uploadImportFile(file, 'zip')
      setZipFileKey(key)

      if (tab === 'zip_sku') {
        await runPreview({ method: 'zip_sku', zipKey: key, replace: replaceExisting })
      } else if (tab === 'zip_mapping' && mappingFileKey) {
        await runPreview({
          method: 'zip_mapping',
          zipKey: key,
          mappingKey: mappingFileKey,
          replace: replaceExisting,
        })
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || error?.message || 'Failed to upload ZIP')
      setZipFile(null)
      setZipFileKey(null)
    } finally {
      setUploading(false)
    }
  }

  const handleMappingChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a .csv mapping file')
      return
    }

    setMappingFile(file)
    setPreview(null)
    setJobId(null)
    setUploading(true)

    try {
      const key = await uploadImportFile(file, 'csv')
      setMappingFileKey(key)

      if (zipFileKey) {
        await runPreview({
          method: 'zip_mapping',
          zipKey: zipFileKey,
          mappingKey: key,
          replace: replaceExisting,
        })
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || error?.message || 'Failed to upload mapping CSV')
      setMappingFile(null)
      setMappingFileKey(null)
    } finally {
      setUploading(false)
    }
  }

  const handleReplaceExistingChange = async (checked: boolean) => {
    setReplaceExisting(checked)
    setJobId(null)

    if (!zipFileKey) return
    if (tab === 'zip_mapping' && !mappingFileKey) return

    try {
      await runPreview({
        method: tab === 'zip_mapping' ? 'zip_mapping' : 'zip_sku',
        zipKey: zipFileKey,
        mappingKey: tab === 'zip_mapping' ? mappingFileKey || undefined : undefined,
        replace: checked,
      })
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to refresh preview')
    }
  }

  const handleConfirmImport = async () => {
    if (!preview || !zipFileKey) return
    if (tab === 'zip_mapping' && !mappingFileKey) {
      toast.error('Upload both ZIP and mapping CSV before importing')
      return
    }

    try {
      const result = await startImageImport({
        method: tab === 'zip_mapping' ? 'zip_mapping' : 'zip_sku',
        zipFileKey,
        mappingFileKey: tab === 'zip_mapping' ? mappingFileKey || undefined : undefined,
        replaceExisting,
        preview,
      }).unwrap()
      setJobId(result.job.id)
      toast.success('Image import started')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to start import')
    }
  }

  const handleCancelJob = async () => {
    if (!jobId) return
    try {
      await cancelImageImport(jobId).unwrap()
      toast.success('Import cancelled')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to cancel import')
    }
  }

  const downloadFailureReport = async () => {
    if (!jobId) return
    try {
      const res = await fetch(downloadImageImportReportUrl(jobId), {
        credentials: 'include',
        headers: { 'X-Requested-With': 'Supplify' },
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `image-import-failures-${jobId}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download failure report')
    }
  }

  useEffect(() => {
    terminalToastShownRef.current = null
  }, [jobId])

  useEffect(() => {
    if (!job || !isJobTerminal) return
    const toastKey = `${job.id}:${job.status}`
    if (terminalToastShownRef.current === toastKey) return
    terminalToastShownRef.current = toastKey

    if (job.status === 'completed') {
      toast.success(
        `Import complete: ${job.matched} matched, ${job.failed} failed, ${job.skipped} skipped`
      )
    } else if (job.status === 'failed') {
      toast.error(job.error_message || 'Image import failed')
    }
  }, [job, isJobTerminal])

  const missingCount = useMemo(() => {
    if (!preview?.summary) return 0
    return preview.summary.unmatchedFiles + preview.summary.unmatchedProducts
  }, [preview])

  const canConfirm =
    preview &&
    (preview.summary?.matched ?? 0) > 0 &&
    !jobId &&
    !uploading &&
    !isPreviewing &&
    tab !== 'url_csv'

  const progressPercent =
    job && job.total_files > 0
      ? Math.min(100, Math.round((job.processed / job.total_files) * 100))
      : 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="image-import-dialog"
      >
        <DialogHeader>
          <DialogTitle>Import Product Images</DialogTitle>
          <DialogDescription>
            Bulk attach catalog images from a ZIP archive. Match by SKU filename or upload a mapping
            CSV when filenames differ.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as ImportTab)
            setPreview(null)
            setJobId(null)
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="zip_sku">ZIP by SKU</TabsTrigger>
            <TabsTrigger value="zip_mapping">ZIP + mapping CSV</TabsTrigger>
            <TabsTrigger value="url_csv">URL via product CSV</TabsTrigger>
          </TabsList>

          <TabsContent value="zip_sku" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="image-import-zip-sku">ZIP archive</Label>
              <Input
                id="image-import-zip-sku"
                type="file"
                accept=".zip,application/zip"
                onChange={handleZipChange}
                disabled={uploading || isProgressPhase}
                className="cursor-pointer"
              />
              <p className="text-sm text-[var(--text-muted)]">
                Name each image file after the product SKU (e.g. <code>SKU-001.jpg</code>).
              </p>
              {zipFile && (
                <p className="text-sm text-[var(--text-muted)]">
                  {zipFile.name} · {formatNumber(zipFile.size / 1024, { maximumFractionDigits: 1 })}{' '}
                  KB
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="zip_mapping" className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="image-import-zip-mapping">ZIP archive</Label>
              <Input
                id="image-import-zip-mapping"
                type="file"
                accept=".zip,application/zip"
                onChange={handleZipChange}
                disabled={uploading || isProgressPhase}
                className="cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image-import-mapping-csv">Mapping CSV</Label>
              <Input
                id="image-import-mapping-csv"
                type="file"
                accept=".csv,text/csv"
                onChange={handleMappingChange}
                disabled={uploading || isProgressPhase}
                className="cursor-pointer"
              />
              <p className="text-sm text-[var(--text-muted)]">
                CSV columns: <strong>SKU</strong> (or product_code/barcode) and{' '}
                <strong>ImageFile</strong> (or image_file/file).
              </p>
            </div>
          </TabsContent>

          <TabsContent value="url_csv" className="pt-2">
            <div className="rounded-md border border-[var(--app-border)] bg-[var(--brand-ultra)] p-4 text-sm text-[var(--brand-mid)]">
              <p className="font-medium text-[var(--text)]">Use product bulk upload instead</p>
              <p className="mt-2">
                To import images from URLs, include an <strong>image_url</strong> column in your
                product CSV and run <strong>Bulk Upload Products</strong>. Remote images are fetched
                during product import.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {tab !== 'url_csv' && (
          <div className="flex items-center justify-between rounded-md border border-[var(--app-border)] px-3 py-2">
            <div>
              <p className="text-sm font-medium">Replace existing images</p>
              <p className="text-xs text-[var(--text-muted)]">
                When off, products that already have an image are skipped.
              </p>
            </div>
            <Switch
              checked={replaceExisting}
              onCheckedChange={handleReplaceExistingChange}
              disabled={uploading || isPreviewing || isProgressPhase}
              data-testid="image-import-replace-toggle"
            />
          </div>
        )}

        {(uploading || isPreviewing) && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploading ? 'Uploading files…' : 'Building preview…'}
          </div>
        )}

        {preview && !isProgressPhase && !isCompletePhase && (
          <div className="space-y-3" data-testid="image-import-preview">
            <Label>Review</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <SummaryCard label="Total in ZIP" value={preview.summary.totalZipFiles} />
              <SummaryCard label="Matched" value={preview.summary.matched} />
              <SummaryCard
                label="Missing"
                value={missingCount}
                tone={missingCount ? 'warn' : 'default'}
              />
              <SummaryCard
                label="Duplicates"
                value={preview.summary.duplicates}
                tone={preview.summary.duplicates ? 'warn' : 'default'}
              />
              <SummaryCard
                label="Invalid"
                value={preview.summary.invalidRows}
                tone={preview.summary.invalidRows ? 'warn' : 'default'}
              />
              <SummaryCard
                label="Without images"
                value={preview.summary.productsWithoutImages}
                tone="muted"
              />
            </div>
            {preview.summary.skippedExisting > 0 && (
              <p className="text-sm text-[var(--text-muted)]">
                {preview.summary.skippedExisting} product(s) skipped because they already have
                images.
              </p>
            )}
            {(preview.unmatchedFiles?.length ?? 0) > 0 && (
              <PreviewDetailSection
                title="Unmatched files"
                rows={preview.unmatchedFiles ?? []}
                columns={[
                  { key: 'fileName', label: 'File' },
                  { key: 'sku', label: 'SKU' },
                  { key: 'stem', label: 'Stem' },
                  { key: 'reason', label: 'Reason' },
                ]}
                testId="image-import-unmatched-files"
              />
            )}
            {(preview.duplicates?.length ?? 0) > 0 && (
              <PreviewDetailSection
                title="Duplicates"
                rows={preview.duplicates ?? []}
                columns={[
                  { key: 'type', label: 'Type' },
                  { key: 'fileName', label: 'File' },
                  { key: 'sku', label: 'SKU' },
                  { key: 'reason', label: 'Reason' },
                ]}
                testId="image-import-duplicates"
              />
            )}
          </div>
        )}

        {isProgressPhase && job && (
          <div className="space-y-3" data-testid="image-import-progress">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium capitalize">{job.status}…</span>
              <span className="text-[var(--text-muted)]">
                {job.processed} / {job.total_files} files
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
              <div
                className="h-full bg-[var(--brand)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {isCompletePhase && job && (
          <div
            className="space-y-2 rounded-md border border-[var(--app-border)] px-3 py-2 text-sm"
            data-testid="image-import-summary"
          >
            <p>
              <strong>{job.matched}</strong> matched ·{' '}
              <strong className="text-[var(--red)]">{job.failed}</strong> failed ·{' '}
              <strong>{job.skipped}</strong> skipped
            </p>
            {job.error_message && <p className="text-[var(--red)]">{job.error_message}</p>}
            {job.failed > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="image-import-download-failures"
                onClick={downloadFailureReport}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download failure report
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          {isProgressPhase ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isCancelling}
              >
                Close
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelJob}
                disabled={isCancelling}
                data-testid="image-import-cancel-job"
              >
                {isCancelling ? 'Cancelling…' : 'Cancel import'}
              </Button>
            </>
          ) : isCompletePhase ? (
            <Button onClick={() => handleOpenChange(false)} data-testid="image-import-done">
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={!canConfirm || isStarting}
                data-testid="image-import-confirm"
              >
                {isStarting ? 'Starting…' : `Import ${preview?.summary.matched ?? 0} image(s)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
