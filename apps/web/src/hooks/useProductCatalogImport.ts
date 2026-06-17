import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiUrl } from '../lib/apiBase'
import {
  useExecuteProductImportMutation,
  useGetProductImportJobQuery,
  usePreviewProductImportMutation,
} from '../services/api'
import {
  isAsyncProductImportStart,
  isTerminalProductImportStatus,
  type ProductImportRowError,
  type ProductImportSummary,
} from '../services/api/endpoints/catalogImport'

type ImportPreviewMeta = {
  totalRows: number
  validCount: number
  errorCount: number
}

type UseProductCatalogImportOptions = {
  refetch: () => void
  onImportSuccess: () => void
}

function isSpreadsheetUpload(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.xls')
}

export function useProductCatalogImport({
  refetch,
  onImportSuccess,
}: UseProductCatalogImportOptions) {
  const [importSummary, setImportSummary] = useState<ProductImportSummary | null>(null)
  const [importPreviewMeta, setImportPreviewMeta] = useState<ImportPreviewMeta | null>(null)
  const [importErrors, setImportErrors] = useState<ProductImportRowError[]>([])
  const [importJobId, setImportJobId] = useState<string | null>(null)
  const importTerminalToastRef = useRef<string | null>(null)

  const [previewImport] = usePreviewProductImportMutation()
  const [executeImport, { isLoading: importing }] = useExecuteProductImportMutation()
  const { data: importJob, isFetching: isPollingImportJob } = useGetProductImportJobQuery(
    importJobId ?? '',
    {
      skip: !importJobId,
      pollingInterval: importJobId ? 2000 : 0,
      skipPollingIfUnfocused: true,
    }
  )

  const importJobActive = Boolean(
    importJobId && importJob && !isTerminalProductImportStatus(importJob.status)
  )

  const resetImportTracking = useCallback(() => {
    setImportSummary(null)
    setImportPreviewMeta(null)
    setImportErrors([])
    setImportJobId(null)
    importTerminalToastRef.current = null
  }, [])

  const applyImportResult = useCallback(
    (result: { summary: ProductImportSummary; errors?: ProductImportRowError[] }) => {
      const { summary } = result
      setImportSummary(summary)
      if (result.errors?.length) setImportErrors(result.errors)
      if (summary.failed > 0) {
        toast.error(`Import finished with ${summary.failed} failed row(s). Valid rows were saved.`)
        return
      }
      toast.success(`Import complete: ${summary.created} created, ${summary.updated} updated`)
      onImportSuccess()
      resetImportTracking()
      refetch()
    },
    [onImportSuccess, refetch, resetImportTracking]
  )

  useEffect(() => {
    if (!importJob || !isTerminalProductImportStatus(importJob.status)) return

    const toastKey = `${importJob.jobId}:${importJob.status}`
    if (importTerminalToastRef.current === toastKey) return

    if (importJob.status === 'completed' && importJob.result?.summary) {
      importTerminalToastRef.current = toastKey
      applyImportResult(importJob.result)
      return
    }

    if (importJob.status === 'failed') {
      importTerminalToastRef.current = toastKey
      toast.error(importJob.errorMessage || 'Bulk upload failed')
    }
  }, [importJob, applyImportResult])

  const previewImportFile = useCallback(
    async (file: File, onPreview: (rows: unknown[]) => void) => {
      resetImportTracking()
      try {
        const result = isSpreadsheetUpload(file)
          ? await previewImport({ file }).unwrap()
          : await previewImport({ csv: await file.text() }).unwrap()
        onPreview(result.preview || [])
        setImportPreviewMeta({
          totalRows: result.totalRows ?? 0,
          validCount: result.validCount ?? 0,
          errorCount: result.errorCount ?? 0,
        })
        setImportErrors(result.errors || [])
        if ((result.validCount ?? 0) === 0) {
          toast.error('No valid rows to import — fix errors below')
        } else {
          toast.success(
            `Preview: ${result.validCount} valid, ${result.errorCount} with issues (${result.totalRows} rows)`
          )
        }
      } catch (error: unknown) {
        const message =
          error && typeof error === 'object' && 'data' in error
            ? (error as { data?: { error?: { message?: string } } }).data?.error?.message
            : undefined
        toast.error(message || 'Failed to preview file')
      }
    },
    [previewImport, resetImportTracking]
  )

  const downloadErrorReport = useCallback(async () => {
    const errors =
      importErrors.length > 0
        ? importErrors
        : (importSummary as { errors?: ProductImportRowError[] })?.errors || []
    if (!errors.length) {
      toast.error('No errors to export')
      return
    }
    try {
      const res = await fetch(apiUrl('/api/supplier/products/import/error-report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Supplify' },
        credentials: 'include',
        body: JSON.stringify({ errors }),
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'import-errors.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download error report')
    }
  }, [importErrors, importSummary])

  const submitImport = useCallback(
    async (uploadedFile: File | null) => {
      if (!uploadedFile) return
      if (importPreviewMeta && importPreviewMeta.validCount === 0) {
        toast.error('Fix validation errors before importing')
        return
      }
      try {
        const result = isSpreadsheetUpload(uploadedFile)
          ? await executeImport({ file: uploadedFile, partial: true }).unwrap()
          : await executeImport({ csv: await uploadedFile.text(), partial: true }).unwrap()
        if (isAsyncProductImportStart(result)) {
          setImportJobId(result.jobId)
          importTerminalToastRef.current = null
          toast.success('Large import queued — processing in the background')
          return
        }
        applyImportResult(result)
      } catch (error: unknown) {
        const message =
          error && typeof error === 'object' && 'data' in error
            ? (error as { data?: { error?: { message?: string } } }).data?.error?.message
            : undefined
        toast.error(message || 'Bulk upload failed')
      }
    },
    [applyImportResult, executeImport, importPreviewMeta]
  )

  return {
    importSummary,
    importPreviewMeta,
    importErrors,
    importJob: importJobId ? importJob : null,
    importJobActive,
    importing: importing || isPollingImportJob,
    previewImportFile,
    downloadErrorReport,
    submitImport,
    resetImportTracking,
  }
}
