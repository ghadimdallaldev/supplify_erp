import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { ProductImageImportDialog } from './ProductImageImportDialog'
import { renderWithProviders } from '../../test/utils'

const mockPreviewData = {
  method: 'zip_sku' as const,
  replaceExisting: false,
  zipFileKey: 'imports/supplier-1/session/products.zip',
  mappingFileKey: null,
  summary: {
    totalZipFiles: 5,
    matched: 3,
    unmatchedFiles: 1,
    unmatchedProducts: 0,
    duplicates: 1,
    invalidRows: 0,
    skippedExisting: 0,
    productsWithoutImages: 2,
    productsWithImages: 1,
  },
  matches: [{ productId: 'p1', sku: 'SKU-001', fileName: 'SKU-001.jpg' }],
}

const mockPresign = vi.fn()
const mockPreview = vi.fn()
const mockStart = vi.fn()
const mockCancel = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    usePresignImageImportMutation: () => [mockPresign, { isLoading: false }],
    usePreviewImageImportMutation: () => [mockPreview, { isLoading: false }],
    useStartImageImportMutation: () => [mockStart, { isLoading: false }],
    useGetImageImportJobQuery: () => ({ data: undefined }),
    useCancelImageImportMutation: () => [mockCancel, { isLoading: false }],
    downloadImageImportReportUrl: (jobId: string) =>
      `/api/supplier/products/images/import/${jobId}/report`,
  }
})

describe('ProductImageImportDialog', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockPresign.mockReturnValue({
      unwrap: async () => ({
        presignedUrl: 'https://upload.test/put',
        fileKey: 'imports/supplier-1/session/products.zip',
      }),
    })
    mockPreview.mockReturnValue({
      unwrap: async () => mockPreviewData,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
      })
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('renders dialog title and tabs', () => {
    renderWithProviders(<ProductImageImportDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByTestId('image-import-dialog')).toBeInTheDocument()
    expect(screen.getByText('Import Product Images')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ZIP by SKU' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ZIP + mapping CSV' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'URL via product CSV' })).toBeInTheDocument()
  })

  it('shows preview summary cards after ZIP upload', async () => {
    renderWithProviders(<ProductImageImportDialog open onOpenChange={vi.fn()} />)

    const zipInput = screen.getByLabelText('ZIP archive')
    const file = new File(['zip-bytes'], 'products.zip', { type: 'application/zip' })
    fireEvent.change(zipInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByTestId('image-import-preview')).toBeInTheDocument()
    })

    const dialog = screen.getAllByTestId('image-import-dialog').at(-1)!
    expect(within(dialog).getByTestId('image-import-stat-matched')).toHaveTextContent('3')
    expect(within(dialog).getByTestId('image-import-stat-total-in-zip')).toHaveTextContent('5')
    expect(within(dialog).getByTestId('image-import-stat-missing')).toHaveTextContent('1')
    expect(within(dialog).getByTestId('image-import-confirm')).toHaveTextContent(
      'Import 3 image(s)'
    )

    expect(mockPresign).toHaveBeenCalled()
    expect(mockPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'zip_sku',
        zipFileKey: 'imports/supplier-1/session/products.zip',
        replaceExisting: false,
      })
    )
  })
})
