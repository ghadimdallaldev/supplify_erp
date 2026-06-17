import { api } from '../base'
import { apiUrl } from '../../../lib/apiBase'

export type ImageImportMethod = 'zip_sku' | 'zip_mapping' | 'url_csv'

export type ImageImportJobStatus =
  | 'pending'
  | 'previewing'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface ImageImportPresignRequest {
  fileName: string
  fileType: string
  fileSize?: number
  purpose: 'zip' | 'csv'
  jobId?: string
}

export interface ImageImportPresignResponse {
  presignedUrl: string
  fileKey: string
  publicUrl?: string
}

export interface ImageImportPreviewRequest {
  method: 'zip_sku' | 'zip_mapping'
  zipFileKey: string
  mappingFileKey?: string
  replaceExisting?: boolean
}

export interface ImageImportSummary {
  totalZipFiles: number
  matched: number
  unmatchedFiles: number
  unmatchedProducts: number
  duplicates: number
  invalidRows: number
  skippedExisting: number
  productsWithoutImages: number
  productsWithImages: number
}

export interface ImageImportPreviewResponse {
  method: ImageImportMethod
  replaceExisting: boolean
  zipFileKey: string
  mappingFileKey: string | null
  summary: ImageImportSummary
  matches?: Array<{ productId: string; sku: string; fileName: string; rowNumber?: number }>
  unmatchedFiles?: Array<Record<string, unknown>>
  unmatchedProducts?: Array<Record<string, unknown>>
  duplicates?: Array<Record<string, unknown>>
  invalidRows?: Array<Record<string, unknown>>
  skippedExisting?: Array<Record<string, unknown>>
  allMatches?: Array<{ productId: string; sku: string; fileName: string; rowNumber?: number }>
}

export interface ImageImportStartRequest extends ImageImportPreviewRequest {
  preview?: ImageImportPreviewResponse
}

export interface ImageImportFailure {
  sku: string
  file?: string
  fileName?: string
  reason: string
}

export interface ImageImportJob {
  id: string
  supplier_id: string
  method: ImageImportMethod
  status: ImageImportJobStatus
  replace_existing: boolean
  source_file_key?: string | null
  mapping_file_key?: string | null
  total_files: number
  processed: number
  matched: number
  failed: number
  skipped: number
  preview_json?: ImageImportPreviewResponse | null
  result_json?: { failures?: ImageImportFailure[] } | null
  error_message?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at?: string
}

/** Build authenticated download URL for failure CSV report. */
export function downloadImageImportReportUrl(jobId: string): string {
  return apiUrl(`/api/supplier/products/images/import/${jobId}/report`)
}

export type ProductImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type ProductImportSummary = {
  created: number
  updated: number
  skipped: number
  failed: number
  imagesImported?: number
  imagesFailed?: number
}

export type ProductImportRowError = {
  rowNumber: number
  errors: Array<{ field: string; message: string }>
}

export type ProductImportSyncResult = {
  summary: ProductImportSummary
  errors?: ProductImportRowError[]
}

export type ProductImportAsyncStart = {
  jobId: string
  status: ProductImportJobStatus
}

export type ProductImportJob = {
  jobId: string
  status: ProductImportJobStatus
  rowCount?: number | null
  preview?: unknown
  result?: ProductImportSyncResult | null
  errorMessage?: string | null
  createdAt?: string
  updatedAt?: string
}

export function isAsyncProductImportStart(
  data: ProductImportSyncResult | ProductImportAsyncStart
): data is ProductImportAsyncStart {
  return 'jobId' in data && !('summary' in data)
}

const TERMINAL_PRODUCT_IMPORT_STATUSES = new Set<ProductImportJobStatus>(['completed', 'failed'])

export function isTerminalProductImportStatus(status: ProductImportJobStatus): boolean {
  return TERMINAL_PRODUCT_IMPORT_STATUSES.has(status)
}

export type ProductImportPreviewRequest =
  | { csv: string; columnMapping?: Record<string, string> }
  | { file: File; columnMapping?: Record<string, string> }

export type ProductImportExecuteRequest =
  | { csv: string; partial?: boolean; columnMapping?: Record<string, string> }
  | { file: File; partial?: boolean; columnMapping?: Record<string, string> }

function buildProductImportBody(
  body: ProductImportPreviewRequest | ProductImportExecuteRequest
): FormData | Record<string, unknown> {
  if ('file' in body && body.file) {
    const formData = new FormData()
    formData.append('file', body.file)
    if (body.columnMapping) {
      formData.append('columnMapping', JSON.stringify(body.columnMapping))
    }
    if ('partial' in body && body.partial !== undefined) {
      formData.append('partial', String(body.partial))
    }
    return formData
  }
  return body as Record<string, unknown>
}

export const catalogImportApi = api.injectEndpoints({
  endpoints: (builder) => ({
    previewProductImport: builder.mutation<
      {
        preview: unknown[]
        totalRows: number
        validCount: number
        errorCount: number
        errors: ProductImportRowError[]
      },
      ProductImportPreviewRequest
    >({
      query: (body) => ({
        url: '/api/supplier/products/import/preview',
        method: 'POST',
        body: buildProductImportBody(body),
      }),
    }),
    executeProductImport: builder.mutation<
      ProductImportSyncResult | ProductImportAsyncStart,
      ProductImportExecuteRequest
    >({
      query: (body) => ({
        url: '/api/supplier/products/import',
        method: 'POST',
        body: buildProductImportBody(body),
      }),
      invalidatesTags: ['Product', 'Inventory'],
    }),
    getProductImportJob: builder.query<ProductImportJob, string>({
      query: (jobId) => `/api/supplier/products/import/${jobId}`,
    }),
    presignImageImport: builder.mutation<ImageImportPresignResponse, ImageImportPresignRequest>({
      query: (body) => ({
        url: '/api/supplier/products/images/import/presign',
        method: 'POST',
        body,
      }),
    }),
    previewImageImport: builder.mutation<ImageImportPreviewResponse, ImageImportPreviewRequest>({
      query: (body) => ({
        url: '/api/supplier/products/images/import/preview',
        method: 'POST',
        body,
      }),
    }),
    startImageImport: builder.mutation<{ job: ImageImportJob }, ImageImportStartRequest>({
      query: (body) => ({
        url: '/api/supplier/products/images/import',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),
    getImageImportJob: builder.query<{ job: ImageImportJob }, string>({
      query: (jobId) => `/api/supplier/products/images/import/${jobId}`,
    }),
    cancelImageImport: builder.mutation<{ job: ImageImportJob }, string>({
      query: (jobId) => ({
        url: `/api/supplier/products/images/import/${jobId}/cancel`,
        method: 'POST',
      }),
    }),
  }),
})

export const {
  usePreviewProductImportMutation,
  useExecuteProductImportMutation,
  useGetProductImportJobQuery,
  usePresignImageImportMutation,
  usePreviewImageImportMutation,
  useStartImageImportMutation,
  useGetImageImportJobQuery,
  useCancelImageImportMutation,
} = catalogImportApi
