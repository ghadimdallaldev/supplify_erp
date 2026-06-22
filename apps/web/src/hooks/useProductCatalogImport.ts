import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('products')
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
        toast.error(t('toast.catalogImportFinishedWithFailures', { failed: summary.failed }))
        return
      }
      toast.success(
        t('toast.catalogImportComplete', { created: summary.created, updated: summary.updated })
      )
      onImportSuccess()
      resetImportTracking()
      refetch()
    },
    [onImportSuccess, refetch, resetImportTracking, t]
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
      toast.error(importJob.errorMessage || t('toast.catalogBulkUploadFailed'))
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
          toast.error(t('toast.catalogNoValidRows'))
        } else {
          toast.success(
            t('toast.catalogPreviewReady', {
              valid: result.validCount,
              errorCount: result.errorCount,
              totalRows: result.totalRows,
            })
          )
        }
      } catch (error: unknown) {
        const message =
          error && typeof error === 'object' && 'data' in error
            ? (error as { data?: { error?: { message?: string } } }).data?.error?.message
            : undefined
        toast.error(message || t('toast.catalogPreviewFailed'))
      }
    },
    [previewImport, resetImportTracking, t]
  )

  const downloadErrorReport = useCallback(async () => {
    const errors =
      importErrors.length > 0
        ? importErrors
        : (importSummary as { errors?: ProductImportRowError[] })?.errors || []
    if (!errors.length) {
      toast.error(t('toast.catalogNoErrorsToExport'))
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
      toast.error(t('toast.catalogErrorReportDownloadFailed'))
    }
  }, [importErrors, importSummary, t])

  const submitImport = useCallback(
    async (uploadedFile: File | null) => {
      if (!uploadedFile) return
      if (importPreviewMeta && importPreviewMeta.validCount === 0) {
        toast.error(t('toast.catalogFixValidationErrors'))
        return
      }
      try {
        const result = isSpreadsheetUpload(uploadedFile)
          ? await executeImport({ file: uploadedFile, partial: true }).unwrap()
          : await executeImport({ csv: await uploadedFile.text(), partial: true }).unwrap()
        if (isAsyncProductImportStart(result)) {
          setImportJobId(result.jobId)
          importTerminalToastRef.current = null
          toast.success(t('toast.catalogLargeImportQueued'))
          return
        }
        applyImportResult(result)
      } catch (error: unknown) {
        const message =
          error && typeof error === 'object' && 'data' in error
            ? (error as { data?: { error?: { message?: string } } }).data?.error?.message
            : undefined
        toast.error(message || t('toast.catalogBulkUploadFailed'))
      }
    },
    [applyImportResult, executeImport, importPreviewMeta, t]
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
