import { Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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

const thClass =
  'border-b border-[var(--app-border)] px-4 py-3 text-start text-sm font-semibold text-[var(--text-mid)]'
const tdClass = 'border-b border-[var(--app-border)] px-4 py-4 align-middle'

export function ProductCatalogTable({
  filteredProducts,
  isSupplier,
  isRestaurant = false,
  onAddToCart,
  onToggleFavorite,
  onAdjustStock,
}: ProductCatalogTableProps) {
  const { t } = useTranslation('products')
  const showFavorite = isRestaurant && Boolean(onToggleFavorite)

  return (
    <>
      <div className="divide-y divide-[var(--app-border)] md:hidden">
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
      <div className="hidden md:block">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="bg-[var(--brand-ultra)]/80">
            <tr>
              <th className={thClass}>{t('catalog.product')}</th>
              <th className={thClass}>{t('catalog.category')}</th>
              <th className={thClass}>{t('catalog.supplier')}</th>
              <th className={thClass}>{t('catalog.price')}</th>
              <th className={thClass}>{t('catalog.stock')}</th>
              <th className={thClass}>{t('catalog.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts?.map((product, index) => (
              <ProductCatalogRow
                key={product.id}
                product={product}
                isSupplier={isSupplier}
                showFavorite={showFavorite}
                onAddToCart={onAddToCart}
                onToggleFavorite={onToggleFavorite}
                onAdjustStock={onAdjustStock}
                layout="table"
                isLastRow={index === (filteredProducts?.length ?? 0) - 1}
                cellClassName={tdClass}
              />
            ))}
          </tbody>
        </table>
      </div>
      {filteredProducts?.length === 0 && (
        <EmptyState
          title={isSupplier ? t('catalog.emptySupplierTitle') : t('catalog.emptyRestaurantTitle')}
          description={
            isSupplier
              ? t('catalog.emptySupplierDescription')
              : t('catalog.emptyRestaurantDescription')
          }
          icon={<Package className="h-10 w-10" aria-hidden />}
        />
      )}
    </>
  )
}
