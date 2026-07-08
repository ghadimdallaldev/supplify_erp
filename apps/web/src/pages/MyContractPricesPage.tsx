import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectTrigger } from '../components/ui/select'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
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
import { ensureNamespace } from '../i18n'
import {
  ResponsiveDataList,
  responsiveDataListClasses,
} from '../components/ui/responsive-data-list'
import { cn } from '../lib/utils'

export function MyContractPricesPage() {
  const { t } = useTranslation('contracts')
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
  const summary = useMemo(() => data?.summary ?? [], [data?.summary])
  const suppliers = suppliersData?.suppliers ?? []
  const showInitialLoad = isLoading && pricing.length === 0

  useEffect(() => {
    void ensureNamespace('contracts')
  }, [])

  const totalProducts = useMemo(
    () => summary.reduce((sum, row) => sum + Number(row.product_count ?? 0), 0),
    [summary]
  )

  return (
    <RequirePermission permission="CATALOG_VIEW">
      <PageShell maxWidth="wide" data-testid="my-contract-prices-page">
        <PageHeader title={t('myPrices.title')} description={t('myPrices.description')} />

        {!showInitialLoad && !isError && (totalProducts > 0 || pricing.length > 0) ? (
          <ContractPricesSummaryStrip
            productCount={pricing.length > 0 ? pricing.length : totalProducts}
            supplierCount={summary.length}
          />
        ) : null}

        <section className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
            <p className="text-sm font-semibold text-[var(--text)]">{t('myPrices.searchFilter')}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="w-full">
              <Label
                htmlFor="contract-price-search"
                className="text-xs font-medium text-[var(--text-mid)]"
              >
                {t('myPrices.search')}
              </Label>
              <div className="relative mt-1">
                <Search
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-mid)]"
                  aria-hidden
                />
                <Input
                  id="contract-price-search"
                  className="pl-9"
                  placeholder={t('myPrices.searchPlaceholder')}
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
                {t('myPrices.supplier')}
              </Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger id="contract-price-supplier" className="mt-1">
                  <option value="">{t('myPrices.allSuppliers')}</option>
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
            <h2 className="text-sm font-semibold text-[var(--text)]">{t('myPrices.priceList')}</h2>
            {!showInitialLoad && pricing.length > 0 ? (
              <p className="text-xs tabular-nums text-[var(--text-muted)]">
                {t('myPrices.product', { count: pricing.length })}
              </p>
            ) : null}
          </div>

          {isError ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center sm:px-5">
              <AlertCircle className="h-8 w-8 text-[var(--red)]" aria-hidden />
              <p className="max-w-md text-sm text-[var(--text-mid)]">
                {getApiErrorMessage(error, t('myPrices.loadError'))}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t('myPrices.tryAgain')}
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
                title={t('myPrices.emptyTitle')}
                description={t('myPrices.emptyDescription')}
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/app/products">{t('myPrices.browseProducts')}</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ResponsiveDataList
              items={pricing}
              keyExtractor={(row) => String(row.id)}
              tableAriaLabel={t('myPrices.title')}
              tableMinWidth={720}
              renderCard={(row) => <MyContractPriceRow row={row} />}
              tableHeader={
                <thead>
                  <tr className="border-b border-[var(--app-border)] text-left text-[var(--text-mid)]">
                    <th className="px-4 py-3 font-medium">{t('myPrices.table.supplier')}</th>
                    <th className="px-4 py-3 font-medium">{t('myPrices.table.product')}</th>
                    <th className="px-4 py-3 font-medium">{t('myPrices.table.yourPrice')}</th>
                    <th
                      className={cn(
                        'px-4 py-3 font-medium',
                        responsiveDataListClasses.columnSecondary
                      )}
                    >
                      {t('myPrices.table.catalogPrice')}
                    </th>
                    <th
                      className={cn(
                        'px-4 py-3 font-medium',
                        responsiveDataListClasses.columnTertiary
                      )}
                    >
                      {t('myPrices.table.valid')}
                    </th>
                    <th
                      className={cn(
                        'px-4 py-3 font-medium',
                        responsiveDataListClasses.columnTertiary
                      )}
                    >
                      {t('myPrices.table.terms')}
                    </th>
                  </tr>
                </thead>
              }
              renderTableRow={(row) => <MyContractPriceTableRow row={row} />}
            />
          )}

          {isFetching && !showInitialLoad && pricing.length > 0 ? (
            <p className="border-t border-[var(--app-border)] py-2 text-center text-xs text-[var(--text-muted)]">
              {t('myPrices.updating')}
            </p>
          ) : null}
        </section>
      </PageShell>
    </RequirePermission>
  )
}
