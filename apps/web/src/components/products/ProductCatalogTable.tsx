import { Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { EmptyState } from '../ui/empty-state'
import { ResponsiveDataList, responsiveDataListClasses } from '../ui/responsive-data-list'
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
  'border-b border-[var(--app-border)] text-start text-sm font-semibold text-[var(--text-mid)]'
const tdClass = 'border-b border-[var(--app-border)] align-middle'

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
  const products = filteredProducts ?? []

  const emptyState =
    products.length === 0 ? (
      <EmptyState
        title={isSupplier ? t('catalog.emptySupplierTitle') : t('catalog.emptyRestaurantTitle')}
        description={
          isSupplier
            ? t('catalog.emptySupplierDescription')
            : t('catalog.emptyRestaurantDescription')
        }
        icon={<Package className="h-10 w-10" aria-hidden />}
      />
    ) : null

  return (
    <ResponsiveDataList
      items={products}
      keyExtractor={(product) => product.id}
      tableAriaLabel={t('page.title')}
      tableMinWidth={640}
      emptyState={emptyState}
      renderCard={(product) => (
        <ProductCatalogRow
          product={product}
          isSupplier={isSupplier}
          showFavorite={showFavorite}
          onAddToCart={onAddToCart}
          onToggleFavorite={onToggleFavorite}
          onAdjustStock={onAdjustStock}
          layout="card"
        />
      )}
      tableHeader={
        <thead className="bg-[var(--brand-ultra)]/80">
          <tr>
            <th className={thClass}>{t('catalog.product')}</th>
            <th className={thClass}>{t('catalog.category')}</th>
            <th className={cn(thClass, responsiveDataListClasses.columnTertiary)}>
              {t('catalog.supplier')}
            </th>
            <th className={thClass}>{t('catalog.price')}</th>
            <th className={thClass}>{t('catalog.stock')}</th>
            <th className={thClass}>{t('catalog.actions')}</th>
          </tr>
        </thead>
      }
      renderTableRow={(product, index) => (
        <ProductCatalogRow
          product={product}
          isSupplier={isSupplier}
          showFavorite={showFavorite}
          onAddToCart={onAddToCart}
          onToggleFavorite={onToggleFavorite}
          onAdjustStock={onAdjustStock}
          layout="table"
          isLastRow={index === products.length - 1}
          cellClassName={tdClass}
        />
      )}
    />
  )
}
