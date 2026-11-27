import { Skeleton } from '../ui/skeleton'
import { Card, CardContent } from '../ui/card'
import { TableScroll } from '../ui/table-scroll'
import { toast } from 'sonner'
import { i18n } from '../../i18n'
import type { CreateCategoryRequestBody } from '../../types'

export const EMPTY_PRODUCT_FORM = {
  name: '',
  sku: '',
  description: '',
  /** Required leaf platform category id. */
  category_id: '',
  shelfIds: [] as string[],
  /** "Request a category": sent after the product is created, with its id. */
  pendingCategoryRequest: null as CreateCategoryRequestBody | null,
  tags: [] as string[],
  unit: '',
  price: '',
  initialStock: '',
  image_url: '',
  warehouse_id: '',
}

export type ProductFormState = typeof EMPTY_PRODUCT_FORM

export function downloadExampleFile() {
  // Category is matched to the platform tree (unknown → Other, flagged for review); Shelf is
  // the supplier's own grouping and is created when missing.
  const csvContent = `Name,SKU,Description,Category,Shelf,Unit,Price,Stock,image_url
Fresh Tomatoes,FT001,Premium fresh tomatoes,Vegetables,Fresh counter,kg,2.50,100,
Organic Lettuce,OL002,Fresh organic lettuce heads,Vegetables,Fresh counter,pack,1.80,50,
Chicken Breast,CB003,Free-range chicken breast,Meat & Poultry,Butchery,kg,8.99,30,
Basmati Rice,BR004,Premium long-grain rice,Grains & Legumes,Dry store,kg,3.25,200,
Olive Oil,OO005,Extra virgin olive oil,Olive oil,Dry store,bottle,12.99,40,
Whole Milk,WM006,Fresh whole milk,Dairy,Fridge,liter,1.25,75,
Orange Juice,OJ007,Fresh squeezed orange juice,Juices,Fridge,liter,2.50,60,
French Bread,FB008,Artisan French baguette,Bakery & Bread,,piece,2.00,45,`

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', 'products-template.csv')
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  toast.success(i18n.t('products:shared.exampleDownloaded'))
}

function ProductCardSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-14 w-14 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-28" />
              <div className="flex gap-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-[var(--app-border)] pt-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ProductTableSkeleton() {
  return (
    <TableScroll aria-label="Loading products">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--app-border)] bg-[var(--brand-ultra)]/80">
            {Array.from({ length: 6 }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <Skeleton className="h-4 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} className="border-b border-[var(--app-border)]">
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 shrink-0 rounded" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <Skeleton className="h-5 w-20 rounded-full" />
              </td>
              <td className="hidden px-4 py-4 xl:table-cell">
                <Skeleton className="h-4 w-24" />
              </td>
              <td className="px-4 py-4">
                <Skeleton className="h-4 w-16" />
              </td>
              <td className="px-4 py-4">
                <Skeleton className="h-4 w-12" />
              </td>
              <td className="px-4 py-4">
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  )
}

export function ProductsPageLoading() {
  return (
    <div className="space-y-6" data-testid="products-page-loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Card className="shadow-sm">
        <CardContent className="space-y-4 p-4 pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="lg:hidden">
          <ProductCardSkeleton />
        </div>
        <div className="hidden lg:block">
          <ProductTableSkeleton />
        </div>
      </Card>
    </div>
  )
}
