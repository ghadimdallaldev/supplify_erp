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
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectTrigger } from '../ui/select'
import { Badge } from '../ui/badge'
import { Search, Package, Plus, X, Clock, Calendar, CheckCircle, ShoppingCart } from 'lucide-react'
import { formatPrice } from '../../utils/format'
import { formatDaysOfWeekLabel, parseDaysOfWeek } from '../../utils/parseDaysOfWeek'
import { cn } from '../../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function QuickListProductDialog(props: any) {
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
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Products to List</DialogTitle>
          <DialogDescription>
            Search and select products to add to your quick list
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              placeholder="Search products..."
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
                  Add
                </Button>
              </div>
            ))}

            {(!filteredProducts || filteredProducts.length === 0) && (
              <div className="text-center py-8 text-[var(--text-muted)]">No products found</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowProductDialog(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
