import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  useCreateQuoteRequestMutation,
  useGetProductsQuery,
  useGetSuppliersQuery,
} from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { EmptyState } from '../components/ui/empty-state'
import { pageHeaderRowClass } from '../components/ui/card-layout'
import toast from 'react-hot-toast'
import { ArrowLeft, Send } from 'lucide-react'
import type { Product } from '../types'

type PrefillState = {
  items?: Array<{ productId: string; quantity: number }>
  supplierIds?: string[]
}

export function CreateQuoteRequestPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = (location.state as { prefill?: PrefillState } | null)?.prefill

  const [search, setSearch] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [neededBy, setNeededBy] = useState('')

  const { data: productsData, isLoading: loadingProducts } = useGetProductsQuery({
    q: search || undefined,
    limit: 50,
    offset: 0,
  })
  const { data: suppliersData, isLoading: loadingSuppliers } = useGetSuppliersQuery({
    limit: 50,
    offset: 0,
  })

  const [createQuoteRequest, { isLoading: submitting }] = useCreateQuoteRequestMutation()

  const products = productsData?.products ?? []
  const suppliers = suppliersData?.suppliers ?? []

  useEffect(() => {
    if (!prefill) return
    if (prefill.items?.length) {
      setSelectedProductIds(new Set(prefill.items.map((i) => i.productId)))
      const q: Record<string, number> = {}
      prefill.items.forEach((i) => {
        q[i.productId] = i.quantity
      })
      setQuantities(q)
    }
    if (prefill.supplierIds?.length) {
      setSelectedSupplierIds(new Set(prefill.supplierIds))
    }
  }, [prefill])

  const toggleProduct = (product: Product) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(product.id)) {
        next.delete(product.id)
      } else {
        next.add(product.id)
        setQuantities((q) => ({ ...q, [product.id]: q[product.id] || 1 }))
      }
      return next
    })
  }

  const toggleSupplier = (supplierId: string) => {
    setSelectedSupplierIds((prev) => {
      const next = new Set(prev)
      if (next.has(supplierId)) next.delete(supplierId)
      else next.add(supplierId)
      return next
    })
  }

  const selectedItems = useMemo(
    () =>
      [...selectedProductIds].map((productId) => ({
        productId,
        quantity: quantities[productId] || 1,
      })),
    [selectedProductIds, quantities]
  )

  const handleSubmit = async () => {
    if (!selectedItems.length) {
      toast.error('Select at least one product')
      return
    }
    if (!selectedSupplierIds.size) {
      toast.error('Select at least one supplier')
      return
    }
    try {
      const result = await createQuoteRequest({
        items: selectedItems,
        supplierIds: [...selectedSupplierIds],
        note: note || undefined,
        neededBy: neededBy || undefined,
      }).unwrap()
      toast.success('Quote request sent')
      navigate(`/app/quote-requests/${result.quoteRequest.id}`)
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to send quote request')
    }
  }

  return (
    <div className="space-y-6">
      <div className={pageHeaderRowClass}>
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link to="/app/quote-requests">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-[var(--text)]">Request best price</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Select items and suppliers. Each supplier can respond with price and availability.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Products</CardTitle>
            <CardDescription>Select items to include in the quote request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {loadingProducts ? (
              <p className="text-sm text-[var(--text-muted)]">Loading products…</p>
            ) : products.length === 0 ? (
              <EmptyState title="No products found" description="Try a different search." />
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {products.map((product) => {
                  const checked = selectedProductIds.has(product.id)
                  return (
                    <div
                      key={product.id}
                      className="flex items-start gap-3 rounded-lg border border-[var(--app-border)] p-3"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(product)}
                        id={`product-${product.id}`}
                        className="mt-1 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`product-${product.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {product.name}
                        </label>
                        <p className="text-xs text-[var(--text-muted)]">{product.sku}</p>
                        {checked && (
                          <div className="mt-2 flex items-center gap-2">
                            <Label htmlFor={`qty-${product.id}`} className="text-xs">
                              Qty
                            </Label>
                            <Input
                              id={`qty-${product.id}`}
                              type="number"
                              min={0.001}
                              step="any"
                              className="h-8 w-24"
                              value={quantities[product.id] ?? 1}
                              onChange={(e) =>
                                setQuantities((q) => ({
                                  ...q,
                                  [product.id]: parseFloat(e.target.value) || 1,
                                }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suppliers</CardTitle>
              <CardDescription>Choose who should receive this quote request.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSuppliers ? (
                <p className="text-sm text-[var(--text-muted)]">Loading suppliers…</p>
              ) : suppliers.length === 0 ? (
                <EmptyState
                  title="No suppliers"
                  description="Follow suppliers to request quotes."
                />
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {suppliers.map((supplier) => (
                    <div
                      key={supplier.id}
                      className="flex items-center gap-3 rounded-lg border border-[var(--app-border)] p-3"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSupplierIds.has(supplier.id)}
                        onChange={() => toggleSupplier(supplier.id)}
                        id={`supplier-${supplier.id}`}
                        className="rounded"
                      />
                      <label
                        htmlFor={`supplier-${supplier.id}`}
                        className="text-sm font-medium cursor-pointer flex-1"
                      >
                        {supplier.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="needed-by">Needed by (optional)</Label>
                <Input
                  id="needed-by"
                  type="date"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quote-note">Note to suppliers</Label>
                <Textarea
                  id="quote-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Delivery preferences, substitutions allowed, etc."
                />
              </div>
              <Button className="w-full" disabled={submitting} onClick={handleSubmit}>
                <Send className="h-4 w-4 mr-2" />
                {submitting ? 'Sending…' : 'Send quote request'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
