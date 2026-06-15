import { Link } from 'react-router-dom'
import { Package, Plus, TrendingUp, Heart } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { EmptyState } from '../ui/empty-state'
import { formatNumber } from '../../utils/format'
import { ContractPriceDisplay } from '../ContractPriceDisplay'
import { AddToOrderingListButton } from '../ordering/AddToOrderingListButton'
import { cn } from '../../lib/utils'

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
  const showFavorite = isRestaurant && onToggleFavorite

  const FavoriteButton = ({ product }: { product: any }) =>
    showFavorite ? (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 shrink-0 p-0"
        aria-label={product.is_favorited ? 'Remove from favorites' : 'Add to favorites'}
        onClick={() => onToggleFavorite?.(product)}
        data-testid={`product-favorite-${product.id}`}
      >
        <Heart
          className={cn('h-4 w-4', product.is_favorited && 'fill-[var(--red)] text-[var(--red)]')}
          aria-hidden
        />
      </Button>
    ) : null
  return (
    <>
      <div className="divide-y md:hidden">
        {filteredProducts?.map((product) => {
          const thumbUrl = product.image_thumb_url ?? product.image_url
          return (
            <div
              key={product.id}
              className="space-y-3 p-4"
              data-testid={`product-card-${product.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--app-border)] bg-[var(--bg)]">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={product.name} className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-6 w-6 text-[var(--text-muted)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1">
                    <p className="font-medium text-[var(--text)]">{product.name}</p>
                    <FavoriteButton product={product} />
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">{product.sku}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="secondary">
                      {product.category_name || product.category || 'N/A'}
                    </Badge>
                    {!isSupplier && product.supplier_name ? (
                      <Badge variant="outline">{product.supplier_name}</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                {product.current_price ? (
                  <ContractPriceDisplay
                    compact
                    currentPrice={product.current_price}
                    catalogPrice={product.catalog_price}
                    pricingSource={product.pricing_source}
                    currency={product.currency}
                    unit={product.unit}
                  />
                ) : (
                  <span className="text-[var(--text-muted)]">N/A</span>
                )}
                <span
                  className={`font-medium ${
                    parseFloat(product.available_qty || 0) > 0
                      ? 'text-[var(--mint)]'
                      : 'text-[var(--red)]'
                  }`}
                >
                  {formatNumber(product.available_qty, { maximumFractionDigits: 2 })}{' '}
                  {product.unit || 'units'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isSupplier && (
                  <>
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={() => onAddToCart(product)}
                      disabled={!product.available_qty || product.available_qty <= 0}
                      data-testid={`product-add-to-cart-${product.id}`}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add to Cart
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
                    className="flex-1 sm:flex-none"
                    onClick={() => onAdjustStock(product)}
                  >
                    <TrendingUp className="mr-1 h-4 w-4" />
                    Adjust Stock
                  </Button>
                )}
                <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild>
                  <Link to={`/app/products/${product.id}`}>View</Link>
                </Button>
              </div>
            </div>
          )
        })}
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
            {filteredProducts?.map((product) => {
              const thumbUrl = product.image_thumb_url ?? product.image_url
              return (
                <tr
                  key={product.id}
                  className="transition-colors hover:bg-[var(--bg)]"
                  data-testid={`product-row-${product.id}`}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--app-border)] bg-[var(--bg)]">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="h-6 w-6 text-[var(--text-muted)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="font-medium text-[var(--text)] truncate">{product.name}</p>
                          <FavoriteButton product={product} />
                        </div>
                        <p className="text-sm text-[var(--text-muted)] truncate">{product.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary">
                        {product.category_name || product.category || 'N/A'}
                      </Badge>
                      {product.tags && Array.isArray(product.tags) && product.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
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
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-[var(--text-muted)]">
                      {product.supplier_name || 'N/A'}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {product.current_price ? (
                      <ContractPriceDisplay
                        compact
                        currentPrice={product.current_price}
                        catalogPrice={product.catalog_price}
                        pricingSource={product.pricing_source}
                        currency={product.currency}
                        unit={product.unit}
                      />
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">N/A</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p
                      className={`text-sm font-medium ${
                        parseFloat(product.available_qty || 0) > 0
                          ? 'text-[var(--mint)]'
                          : 'text-[var(--red)]'
                      }`}
                    >
                      {formatNumber(product.available_qty, { maximumFractionDigits: 2 })}{' '}
                      {product.unit || 'units'}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      {!isSupplier && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => onAddToCart(product)}
                            disabled={!product.available_qty || product.available_qty <= 0}
                            data-testid={`product-add-to-cart-${product.id}`}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add to Cart
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
                        <Button size="sm" variant="outline" onClick={() => onAdjustStock(product)}>
                          <TrendingUp className="h-4 w-4 mr-1" />
                          Adjust Stock
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/app/products/${product.id}`}>View</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
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
