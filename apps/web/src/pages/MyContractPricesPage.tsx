import { useMemo, useState } from 'react'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectTrigger } from '../components/ui/select'
import { PageHeader } from '../components/ui/page-header'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { useGetMyContractPricingQuery, useGetSuppliersQuery } from '../services/api'
import { RequirePermission } from '../components/RequirePermission'
import { getApiErrorMessage } from '../lib/apiError'
import { Button } from '../components/ui/button'
import {
  ContractPricesEmptyIcon,
  ContractPricesSummaryStrip,
  MyContractPriceRow,
  MyContractPriceTableRow,
  SupplierPriceFilter,
  type MyContractPriceRowData,
} from '../components/MyContractPriceRow'
import { Search, AlertCircle, Filter } from 'lucide-react'
import { Link } from 'react-router-dom'

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

  const { data, isLoading, isFetching, isError, error, refetch } = useGetMyContractPricingQuery(
    queryParams,
    { refetchOnMountOrArgChange: true }
  )
  const { data: suppliersData } = useGetSuppliersQuery({ limit: 200, offset: 0 })

  const pricing = (data?.pricing ?? []) as MyContractPriceRowData[]
  const summary = data?.summary ?? []
  const suppliers = suppliersData?.suppliers ?? []
  const showInitialLoad = isLoading && pricing.length === 0

  const totalProducts = useMemo(
    () => summary.reduce((sum, row) => sum + Number(row.product_count ?? 0), 0),
    [summary]
  )

  return (
    <RequirePermission permission="CATALOG_VIEW">
      <div className="space-y-6">
        <PageHeader
          title="My Contract Prices"
          description="Special prices negotiated with your suppliers."
        />

        {!showInitialLoad && !isError && (totalProducts > 0 || pricing.length > 0) ? (
          <ContractPricesSummaryStrip
            productCount={pricing.length > 0 ? pricing.length : totalProducts}
            supplierCount={summary.length}
          />
        ) : null}

        <section className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
            <p className="text-sm font-semibold text-[var(--text)]">Search & filter</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="w-full">
              <Label
                htmlFor="contract-price-search"
                className="text-xs font-medium text-[var(--text-mid)]"
              >
                Search
              </Label>
              <div className="relative mt-1">
                <Search
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-mid)]"
                  aria-hidden
                />
                <Input
                  id="contract-price-search"
                  className="pl-9"
                  placeholder="Product or supplier…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="w-full">
              <Label
                htmlFor="contract-price-supplier"
                className="text-xs font-medium text-[var(--text-mid)]"
              >
                Supplier
              </Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger id="contract-price-supplier" className="mt-1">
                  <option value="">All suppliers</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
          </div>
          {summary.length > 0 ? (
            <div className="mt-4 border-t border-[var(--app-border)] pt-4">
              <SupplierPriceFilter
                summary={summary}
                selectedSupplierId={supplierFilter}
                onSelect={setSupplierFilter}
              />
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-[var(--text)]">Price list</h2>
            {!showInitialLoad && pricing.length > 0 ? (
              <p className="text-xs tabular-nums text-[var(--text-muted)]">
                {pricing.length} product{pricing.length === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>

          {isError ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center sm:px-5">
              <AlertCircle className="h-8 w-8 text-[var(--red)]" aria-hidden />
              <p className="max-w-md text-sm text-[var(--text-mid)]">
                {getApiErrorMessage(error, 'Unable to load your contract prices.')}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : showInitialLoad ? (
            <div
              className="divide-y divide-[var(--app-border)]"
              data-testid="contract-prices-loading"
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-4 sm:px-5">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : pricing.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={<ContractPricesEmptyIcon />}
                title="No contract prices yet"
                description="Ask your suppliers to set negotiated pricing for your account, or browse the catalog for standard prices."
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/app/products">Browse products</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div className="divide-y divide-[var(--app-border)] md:hidden">
                {pricing.map((row) => (
                  <MyContractPriceRow key={String(row.id)} row={row} />
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-sm" data-testid="contract-prices-table">
                  <thead>
                    <tr className="border-b border-[var(--app-border)] text-left text-[var(--text-mid)]">
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
                      <MyContractPriceTableRow key={String(row.id)} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {isFetching && !showInitialLoad && pricing.length > 0 ? (
            <p className="border-t border-[var(--app-border)] py-2 text-center text-xs text-[var(--text-muted)]">
              Updating…
            </p>
          ) : null}
        </section>
      </div>
    </RequirePermission>
  )
}
