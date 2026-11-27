import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { ProductBulkUploadDialog } from './ProductBulkUploadDialog'
import type { CategoryDepartment } from '../../types'

const departments: CategoryDepartment[] = [
  {
    id: 'dept-dairy',
    slug: 'dept-dairy-eggs-cheese',
    name: 'Dairy, eggs & cheese',
    name_ar: 'ألبان وبيض وأجبان',
    icon_key: 'cheese',
    product_count: 0,
    categories: [
      {
        id: 'leaf-cheese',
        slug: 'cheese',
        name: 'Cheese',
        name_ar: 'أجبان',
        icon_key: 'cheese',
        product_count: 0,
      },
    ],
  },
  {
    id: 'dept-other',
    slug: 'dept-other',
    name: 'Other',
    name_ar: 'أخرى',
    icon_key: 'dots-three',
    product_count: 0,
    categories: [
      {
        id: 'leaf-other',
        slug: 'other',
        name: 'Other',
        name_ar: 'أخرى',
        icon_key: 'dots-three',
        product_count: 0,
      },
    ],
  },
]

describe('ProductBulkUploadDialog', () => {
  it('import preview override', async () => {
    const setCategoryOverride = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ProductBulkUploadDialog
        showBulkUpload
        setShowBulkUpload={() => {}}
        uploadedFile={new File(['x'], 'products.csv')}
        setUploadedFile={() => {}}
        uploadPreview={[
          {
            rowNumber: 2,
            status: 'valid',
            mapped: { sku: 'ZQ-1', name: 'Zqxv wheel' },
            errors: [],
            matchedCategoryId: 'leaf-other',
            matchedCategoryName: 'Other',
            score: 0,
            needsReview: true,
            shelf: 'Fridge',
          },
          {
            rowNumber: 3,
            status: 'valid',
            mapped: { sku: 'BR-1', name: 'Burrata' },
            errors: [],
            matchedCategoryId: 'leaf-cheese',
            matchedCategoryName: 'Cheese',
            score: 1,
            needsReview: false,
            shelf: null,
          },
        ]}
        setUploadPreview={() => {}}
        importPreviewMeta={{ totalRows: 2, validCount: 2, errorCount: 0 }}
        importErrors={[]}
        importSummary={null}
        handleFileUpload={() => {}}
        downloadErrorReport={() => {}}
        handleBulkSubmit={() => {}}
        importing={false}
        isCreating={false}
        departments={departments}
        categoryOverrides={{}}
        setCategoryOverride={setCategoryOverride}
      />
    )

    const reviewRow = screen.getByTestId('import-row-2')
    expect(within(reviewRow).getByText('Needs review')).toBeInTheDocument()
    expect(within(reviewRow).getByText('Fridge')).toBeInTheDocument()
    const picker = within(reviewRow).getByRole('combobox', { name: /Category for row 2/ })
    expect(picker).toHaveValue('leaf-other')
    await user.selectOptions(picker, 'leaf-cheese')
    expect(setCategoryOverride).toHaveBeenCalledWith(2, 'leaf-cheese')

    const matchedRow = screen.getByTestId('import-row-3')
    expect(within(matchedRow).queryByText('Needs review')).not.toBeInTheDocument()
    expect(within(matchedRow).getByRole('combobox', { name: /Category for row 3/ })).toHaveValue(
      'leaf-cheese'
    )
  })
})
