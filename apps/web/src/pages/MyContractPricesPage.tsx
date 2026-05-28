import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useGetMyContractPricingQuery, useGetSuppliersQuery } from '../services/api'
import { RequirePermission } from '../components/RequirePermission'
import { ContractPriceDisplay } from '../components/ContractPriceDisplay'
import { formatPrice } from '../utils/format'
import { Loader2, Search } from 'lucide-react'

export function MyContractPricesPage() {
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')

  const queryParams = useMemo(
    () => ({
      q: search || undefined,
      supplierId: supplierFilter || undefined,
    }),
    [search, supplierFilter]
  )

  const { data, isLoading } = useGetMyContractPricingQuery(queryParams)
  const { data: suppliersData } = useGetSuppliersQuery({ limit: 200, offset: 0 })

  const pricing = data?.pricing ?? []
  const suppliers = suppliersData?.suppliers ?? []

  return (
    <RequirePermission permission="CATALOG_VIEW">
      <div className="space-y-6">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">My Contract Prices</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Special prices negotiated with your suppliers.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="search"
                  className="pl-8"
                  placeholder="Product or supplier…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="min-w-[180px]">
              <Label htmlFor="supplier">Supplier</Label>
              <select
                id="supplier"
                className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
              >
                <option value="">All suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
              </div>
            ) : pricing.length === 0 ? (
              <p className="text-center py-12 text-[var(--text-muted)]">
                No active contract prices from your suppliers.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--app-border)] text-left text-[var(--text-muted)]">
                      <th className="px-4 py-3 font-medium">Supplier</th>
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium">Your price</th>
                      <th className="px-4 py-3 font-medium">Catalog price</th>
                      <th className="px-4 py-3 font-medium">Valid</th>
                      <th className="px-4 py-3 font-medium">Terms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.map((row) => (
                      <tr key={String(row.id)} className="border-b border-[var(--app-border)]">
                        <td className="px-4 py-3">{String(row.supplier_name)}</td>
                        <td className="px-4 py-3">
                          <div>{String(row.product_name)}</div>
                          <div className="text-xs text-[var(--text-muted)]">{row.product_sku}</div>
                        </td>
                        <td className="px-4 py-3">
                          <ContractPriceDisplay
                            compact
                            currentPrice={Number(row.price)}
                            catalogPrice={
                              row.catalog_price != null ? Number(row.catalog_price) : null
                            }
                            pricingSource="CONTRACT_PRICE"
                          />
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">
                          {row.catalog_price != null ? formatPrice(Number(row.catalog_price)) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                          {row.contract_start_date
                            ? String(row.contract_start_date).slice(0, 10)
                            : '—'}{' '}
                          →{' '}
                          {row.contract_end_date ? String(row.contract_end_date).slice(0, 10) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {row.agreement_type && (
                              <Badge variant="outline" className="text-xs">
                                {String(row.agreement_type)}
                              </Badge>
                            )}
                            {row.min_order_quantity != null && (
                              <Badge variant="outline" className="text-xs">
                                Min {row.min_order_quantity}
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RequirePermission>
  )
}
