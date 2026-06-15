import { Package } from 'lucide-react'
import { EmptyState } from '../ui/empty-state'
import { ProductCatalogRow } from './ProductCatalogRow'

type ProductCatalogTableProps = {
  filteredProducts: any[] | undefined
  isSupplier: boolean
  isRestaurant?: boolean
  onAddToCart: (product: any) => void
  onToggleFavorite?: (product: any) => void
  onAdjustStock: (product: any) => void
}

export function ProductCatalogTable({
  filteredProducts,
  isSupplier,
  isRestaurant = false,
  onAddToCart,
  onToggleFavorite,
  onAdjustStock,
}: ProductCatalogTableProps) {
  const showFavorite = isRestaurant && Boolean(onToggleFavorite)

  return (
    <>
      <div className="divide-y md:hidden">
        {filteredProducts?.map((product) => (
          <ProductCatalogRow
            key={product.id}
            product={product}
            isSupplier={isSupplier}
            showFavorite={showFavorite}
            onAddToCart={onAddToCart}
            onToggleFavorite={onToggleFavorite}
            onAdjustStock={onAdjustStock}
            layout="card"
          />
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-[var(--app-border)] bg-[var(--bg)]">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                Product
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                Category
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                Supplier
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                Price
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                Stock
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-mid)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {filteredProducts?.map((product) => (
              <ProductCatalogRow
                key={product.id}
                product={product}
                isSupplier={isSupplier}
                showFavorite={showFavorite}
                onAddToCart={onAddToCart}
                onToggleFavorite={onToggleFavorite}
                onAdjustStock={onAdjustStock}
                layout="table"
              />
            ))}
          </tbody>
        </table>
      </div>
      {filteredProducts?.length === 0 && (
        <EmptyState
          title={isSupplier ? 'No products in your catalog' : 'No products found'}
          description={
            isSupplier
              ? 'Add your first product or adjust filters to see existing items.'
              : 'Try a different search or supplier filter.'
          }
          icon={<Package className="h-10 w-10" aria-hidden />}
        />
      )}
    </>
  )
}
