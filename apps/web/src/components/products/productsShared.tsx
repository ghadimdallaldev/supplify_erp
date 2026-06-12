import { Skeleton } from '../ui/skeleton'
import { Card, CardContent } from '../ui/card'
import { toast } from 'sonner'

export const EMPTY_PRODUCT_FORM = {
  name: '',
  sku: '',
  description: '',
  category: '',
  category_id: '',
  tags: [] as string[],
  unit: '',
  price: '',
  initialStock: '',
  image_url: '',
  warehouse_id: '',
}

export type ProductFormState = typeof EMPTY_PRODUCT_FORM

export function downloadExampleFile() {
  const csvContent = `Name,SKU,Description,Category,Unit,Price,Stock
Fresh Tomatoes,FT001,Premium fresh tomatoes,Vegetables,kg,2.50,100
Organic Lettuce,OL002,Fresh organic lettuce heads,Vegetables,pack,1.80,50
Chicken Breast,CB003,Free-range chicken breast,Meat,kg,8.99,30
Basmati Rice,BR004,Premium long-grain rice,Grains,kg,3.25,200
Olive Oil,OO005,Extra virgin olive oil,Oils,bottle,12.99,40
Whole Milk,WM006,Fresh whole milk,Dairy,liter,1.25,75
Orange Juice,OJ007,Fresh squeezed orange juice,Beverages,liter,2.50,60
French Bread,FB008,Artisan French baguette,Grains,loaf,2.00,45`

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', 'products-template.csv')
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  toast.success('Example file downloaded!')
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4">
              <Skeleton className="h-14 w-14 shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
