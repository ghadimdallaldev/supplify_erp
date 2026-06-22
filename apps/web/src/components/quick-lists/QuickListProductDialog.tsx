import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Search, Plus } from 'lucide-react'
import { formatPrice } from '../../utils/format'

export function QuickListProductDialog(props: any) {
  const { t } = useTranslation('cart')
  const {
    showProductDialog,
    setShowProductDialog,
    productSearch,
    setProductSearch,
    filteredProducts,
    handleAddProductToList,
  } = props

  return (
    <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t('quickLists.productDialog.title')}</DialogTitle>
          <DialogDescription>{t('quickLists.productDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              placeholder={t('quickLists.productDialog.searchPlaceholder')}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Product List */}
          <div className="border rounded-md max-h-96 overflow-y-auto divide-y">
            {filteredProducts?.map((product: any, productIndex: number) => (
              <div
                key={`${product.id}-${product.supplier_id ?? productIndex}`}
                className="flex items-center justify-between p-4 hover:bg-[var(--brand-ultra)]"
              >
                <div className="flex-1">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-[var(--text-muted)]">{product.sku}</p>
                  <p className="text-sm font-semibold text-[var(--mint)]">
                    {formatPrice(product.price)} / {product.unit}
                  </p>
                </div>
                <Button size="sm" onClick={() => handleAddProductToList(product)}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t('quickLists.productDialog.add')}
                </Button>
              </div>
            ))}

            {(!filteredProducts || filteredProducts.length === 0) && (
              <div className="text-center py-8 text-[var(--text-muted)]">
                {t('quickLists.productDialog.noProducts')}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowProductDialog(false)}>
            {t('quickLists.productDialog.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
