import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Package, Plus, TrendingUp, Heart } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { formatNumber } from '../../utils/format'
import { ContractPriceDisplay } from '../ContractPriceDisplay'
import { AddToOrderingListButton } from '../ordering/AddToOrderingListButton'
import { cn } from '../../lib/utils'

type ProductCatalogRowProps = {
  product: any
  isSupplier: boolean
  showFavorite: boolean
  onAddToCart: (product: any) => void
  onToggleFavorite?: (product: any) => void
  onAdjustStock: (product: any) => void
  layout: 'card' | 'table'
  isLastRow?: boolean
  cellClassName?: string
}

function ProductThumb({ product, size }: { product: any; size: 'sm' | 'md' }) {
  const thumbUrl = product.image_thumb_url ?? product.image_url
  const boxClass =
    size === 'sm'
      ? 'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--app-border)] bg-[var(--bg)]'
      : 'flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--app-border)] bg-[var(--bg)]'

  return (
    <div className={boxClass}>
      {thumbUrl ? (
        <img src={thumbUrl} alt={product.name} className="h-full w-full object-cover" />
      ) : (
        <Package className="h-6 w-6 text-[var(--text-muted)]" />
      )}
    </div>
  )
}

function FavoriteButton({
  product,
  showFavorite,
  onToggleFavorite,
}: {
  product: any
  showFavorite: boolean
  onToggleFavorite?: (product: any) => void
}) {
  const { t } = useTranslation('products')
  if (!showFavorite) return null
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-8 w-8 shrink-0 p-0"
      aria-label={
        product.is_favorited ? t('catalog.removeFromFavorites') : t('catalog.addToFavorites')
      }
      onClick={() => onToggleFavorite?.(product)}
      data-testid={`product-favorite-${product.id}`}
    >
      <Heart
        className={cn('h-4 w-4', product.is_favorited && 'fill-[var(--red)] text-[var(--red)]')}
        aria-hidden
      />
    </Button>
  )
}

function CategoryBadges({
  product,
  layout,
  isSupplier,
}: {
  product: any
  layout: 'card' | 'table'
  isSupplier: boolean
}) {
  const { t } = useTranslation('products')
  const categoryLabel = product.category_name || product.category || t('catalog.notAvailable')
  if (layout === 'card') {
    return (
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="secondary">{categoryLabel}</Badge>
        {!isSupplier && product.supplier_name ? (
          <Badge variant="outline">{product.supplier_name}</Badge>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge variant="secondary">{categoryLabel}</Badge>
      {product.tags && Array.isArray(product.tags) && product.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {product.tags.slice(0, 3).map((tag: string, idx: number) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {product.tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{product.tags.length - 3}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

function PriceCell({ product, layout }: { product: any; layout: 'card' | 'table' }) {
  const { t } = useTranslation('products')
  if (product.current_price) {
    return (
      <ContractPriceDisplay
        compact
        currentPrice={product.current_price}
        catalogPrice={product.catalog_price}
        pricingSource={product.pricing_source}
        currency={product.currency}
        unit={product.unit}
      />
    )
  }
  if (layout === 'card') {
    return <span className="text-[var(--text-muted)]">{t('catalog.notAvailable')}</span>
  }
  return <p className="text-sm text-[var(--text-muted)]">{t('catalog.notAvailable')}</p>
}

function StockLabel({ product, layout }: { product: any; layout: 'card' | 'table' }) {
  const { t } = useTranslation('products')
  const inStock = parseFloat(product.available_qty || 0) > 0
  const text = `${formatNumber(product.available_qty, { maximumFractionDigits: 2 })} ${product.unit || t('catalog.units')}`
  if (layout === 'card') {
    return (
      <span className={`font-medium ${inStock ? 'text-[var(--mint)]' : 'text-[var(--red)]'}`}>
        {text}
      </span>
    )
  }
  return (
    <p className={`text-sm font-medium ${inStock ? 'text-[var(--mint)]' : 'text-[var(--red)]'}`}>
      {text}
    </p>
  )
}

function ProductActions({
  product,
  isSupplier,
  layout,
  onAddToCart,
  onAdjustStock,
}: Pick<
  ProductCatalogRowProps,
  'product' | 'isSupplier' | 'layout' | 'onAddToCart' | 'onAdjustStock'
>) {
  const { t } = useTranslation('products')
  const buttonClass = layout === 'card' ? 'flex-1 sm:flex-none' : undefined

  return (
    <div className={layout === 'card' ? 'flex flex-wrap gap-2' : 'flex items-center gap-2'}>
      {!isSupplier && (
        <>
          <Button
            size="sm"
            className={buttonClass}
            onClick={() => onAddToCart(product)}
            disabled={!product.available_qty || product.available_qty <= 0}
            data-testid={`product-add-to-cart-${product.id}`}
          >
            <Plus className={layout === 'card' ? 'me-1 h-4 w-4' : 'h-4 w-4 me-1'} />
            {t('catalog.addToCart')}
          </Button>
          {product.supplier_id && (
            <AddToOrderingListButton
              productId={product.id}
              supplierId={product.supplier_id}
              productName={product.name}
              defaultUnit={product.unit}
            />
          )}
        </>
      )}
      {isSupplier && (
        <Button
          size="sm"
          variant="outline"
          className={buttonClass}
          onClick={() => onAdjustStock(product)}
        >
          <TrendingUp className={layout === 'card' ? 'me-1 h-4 w-4' : 'h-4 w-4 me-1'} />
          {t('catalog.adjustStock')}
        </Button>
      )}
      <Button variant="outline" size="sm" className={buttonClass} asChild>
        <Link to={`/app/products/${product.id}`}>{t('catalog.view')}</Link>
      </Button>
    </div>
  )
}

export function ProductCatalogRow({
  product,
  isSupplier,
  showFavorite,
  onAddToCart,
  onToggleFavorite,
  onAdjustStock,
  layout,
  isLastRow = false,
  cellClassName = 'px-4 py-4',
}: ProductCatalogRowProps) {
  const { t } = useTranslation('products')
  if (layout === 'card') {
    return (
      <div className="space-y-3 p-4" data-testid={`product-card-${product.id}`}>
        <div className="flex items-start gap-3">
          <ProductThumb product={product} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <p className="font-medium text-[var(--text)]">{product.name}</p>
              <FavoriteButton
                product={product}
                showFavorite={showFavorite}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
            <p className="text-sm text-[var(--text-muted)]">{product.sku}</p>
            <CategoryBadges product={product} layout="card" isSupplier={isSupplier} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <PriceCell product={product} layout="card" />
          <StockLabel product={product} layout="card" />
        </div>
        <ProductActions
          product={product}
          isSupplier={isSupplier}
          layout="card"
          onAddToCart={onAddToCart}
          onAdjustStock={onAdjustStock}
        />
      </div>
    )
  }

  return (
    <tr
      className="transition-colors hover:bg-[var(--brand-ultra)]/50"
      data-testid={`product-row-${product.id}`}
    >
      <td className={cn(cellClassName, isLastRow && 'border-b-0')}>
        <div className="flex items-center gap-3">
          <ProductThumb product={product} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="truncate font-medium text-[var(--text)]">{product.name}</p>
              <FavoriteButton
                product={product}
                showFavorite={showFavorite}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
            <p className="truncate text-sm text-[var(--text-muted)]">{product.sku}</p>
          </div>
        </div>
      </td>
      <td className={cn(cellClassName, isLastRow && 'border-b-0')}>
        <CategoryBadges product={product} layout="table" isSupplier={isSupplier} />
      </td>
      <td className={cn(cellClassName, isLastRow && 'border-b-0')}>
        <p className="text-sm text-[var(--text-muted)]">
          {product.supplier_name || t('catalog.notAvailable')}
        </p>
      </td>
      <td className={cn(cellClassName, isLastRow && 'border-b-0')}>
        <PriceCell product={product} layout="table" />
      </td>
      <td className={cn(cellClassName, isLastRow && 'border-b-0')}>
        <StockLabel product={product} layout="table" />
      </td>
      <td className={cn(cellClassName, isLastRow && 'border-b-0')}>
        <ProductActions
          product={product}
          isSupplier={isSupplier}
          layout="table"
          onAddToCart={onAddToCart}
          onAdjustStock={onAdjustStock}
        />
      </td>
    </tr>
  )
}
