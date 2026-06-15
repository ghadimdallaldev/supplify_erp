import { lazy } from 'react'

export const LazyProductFormDialog = lazy(() =>
  import('./ProductFormDialog').then((m) => ({ default: m.ProductFormDialog }))
)
export const LazyProductBulkUploadDialog = lazy(() =>
  import('./ProductBulkUploadDialog').then((m) => ({ default: m.ProductBulkUploadDialog }))
)
export const LazyInventoryAdjustmentDialog = lazy(() =>
  import('./InventoryAdjustmentDialog').then((m) => ({ default: m.InventoryAdjustmentDialog }))
)
export const LazyProductImageImportDialog = lazy(() =>
  import('./ProductImageImportDialog').then((m) => ({ default: m.ProductImageImportDialog }))
)
