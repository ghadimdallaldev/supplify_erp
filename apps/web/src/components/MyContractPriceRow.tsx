import { Badge } from './ui/badge'
import { ContractPriceDisplay } from './ContractPriceDisplay'
import { formatPrice } from '../utils/format'
import { cn } from '../lib/utils'
import { Tag } from 'lucide-react'
import { responsiveDataListClasses } from './ui/responsive-data-list'

export type MyContractPriceRowData = {
  id: string | number
  supplier_name?: string | null
  product_name?: string | null
  product_sku?: string | null
  price?: number | string | null
  catalog_price?: number | string | null
  contract_start_date?: string | null
  contract_end_date?: string | null
  agreement_type?: string | null
  min_order_quantity?: number | string | null
}

function formatValidity(start?: string | null, end?: string | null) {
  const from = start ? String(start).slice(0, 10) : '—'
  const to = end ? String(end).slice(0, 10) : '—'
  return `${from} → ${to}`
}

function savingsLabel(catalog: number | null, contract: number | null) {
  if (catalog == null || contract == null || catalog <= contract) return null
  const pct = Math.round(((catalog - contract) / catalog) * 100)
  return `${pct}% below catalog`
}

export function MyContractPriceRow({ row }: { row: MyContractPriceRowData }) {
  const contractPrice = row.price != null ? Number(row.price) : null
  const catalogPrice = row.catalog_price != null ? Number(row.catalog_price) : null
  const savings = savingsLabel(catalogPrice, contractPrice)

  return (
    <article
      data-testid={`contract-price-row-${row.id}`}
      className="px-4 py-4 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--brand-mid)]">
            {String(row.supplier_name ?? 'Supplier')}
          </p>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">
            {String(row.product_name ?? 'Product')}
          </h3>
          {row.product_sku ? (
            <p className="mt-0.5 font-mono text-xs text-[var(--text-mid)]">{row.product_sku}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {row.agreement_type ? (
              <Badge variant="outline" className="text-[10px]">
                {String(row.agreement_type)}
              </Badge>
            ) : null}
            {row.min_order_quantity != null ? (
              <Badge variant="outline" className="text-[10px]">
                Min {row.min_order_quantity}
              </Badge>
            ) : null}
            {savings ? (
              <span className="text-xs font-medium text-[var(--mint)]">{savings}</span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-[var(--text-mid)]">
            Valid {formatValidity(row.contract_start_date, row.contract_end_date)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <ContractPriceDisplay
            compact
            currentPrice={contractPrice}
            catalogPrice={catalogPrice}
            pricingSource="CONTRACT_PRICE"
          />
          {catalogPrice != null ? (
            <p className="text-xs text-[var(--text-mid)]">Catalog {formatPrice(catalogPrice)}</p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function MyContractPriceTableRow({ row }: { row: MyContractPriceRowData }) {
  const contractPrice = row.price != null ? Number(row.price) : null
  const catalogPrice = row.catalog_price != null ? Number(row.catalog_price) : null
  const savings = savingsLabel(catalogPrice, contractPrice)

  return (
    <tr
      data-testid={`contract-price-row-${row.id}`}
      className="border-b border-[var(--app-border)] transition-colors hover:bg-[var(--brand-ultra)]/50"
    >
      <td className="px-4 py-3 text-sm text-[var(--text)]">{String(row.supplier_name)}</td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-[var(--text)]">{String(row.product_name)}</div>
        {row.product_sku ? (
          <div className="font-mono text-xs text-[var(--text-mid)]">{row.product_sku}</div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <ContractPriceDisplay
          compact
          currentPrice={contractPrice}
          catalogPrice={catalogPrice}
          pricingSource="CONTRACT_PRICE"
        />
        {savings ? (
          <p className="mt-0.5 text-xs font-medium text-[var(--mint)]">{savings}</p>
        ) : null}
      </td>
      <td
        className={cn(
          'px-4 py-3 text-sm text-[var(--text-mid)] tabular-nums',
          responsiveDataListClasses.columnSecondary
        )}
      >
        {catalogPrice != null ? formatPrice(catalogPrice) : '—'}
      </td>
      <td
        className={cn(
          'px-4 py-3 text-xs text-[var(--text-mid)] whitespace-nowrap',
          responsiveDataListClasses.columnTertiary
        )}
      >
        {formatValidity(row.contract_start_date, row.contract_end_date)}
      </td>
      <td className={cn('px-4 py-3', responsiveDataListClasses.columnTertiary)}>
        <div className="flex flex-wrap gap-1">
          {row.agreement_type ? (
            <Badge variant="outline" className="text-[10px]">
              {String(row.agreement_type)}
            </Badge>
          ) : null}
          {row.min_order_quantity != null ? (
            <Badge variant="outline" className="text-[10px]">
              Min {row.min_order_quantity}
            </Badge>
          ) : null}
        </div>
      </td>
    </tr>
  )
}

type SupplierSummary = {
  supplier_id?: string | number | null
  supplier_name?: string | null
  product_count?: number | string | null
}

export function SupplierPriceFilter({
  summary,
  selectedSupplierId,
  onSelect,
}: {
  summary: SupplierSummary[]
  selectedSupplierId: string
  onSelect: (supplierId: string) => void
}) {
  if (summary.length === 0) return null

  return (
    <div
      className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none"
      role="tablist"
      aria-label="Filter by supplier"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!selectedSupplierId}
        onClick={() => onSelect('')}
        className={cn(
          'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
          !selectedSupplierId
            ? 'bg-[var(--brand-mid)] text-white'
            : 'text-[var(--text-mid)] hover:bg-[var(--brand-ultra)] hover:text-[var(--text)]'
        )}
      >
        All suppliers
      </button>
      {summary.map((row) => {
        const id = String(row.supplier_id ?? row.supplier_name ?? '')
        const active = selectedSupplierId === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(active ? '' : id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-[var(--brand-mid)] text-white'
                : 'text-[var(--text-mid)] hover:bg-[var(--brand-ultra)] hover:text-[var(--text)]'
            )}
          >
            {String(row.supplier_name)}
            <span className="ml-1.5 tabular-nums opacity-80">{Number(row.product_count ?? 0)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ContractPricesSummaryStrip({
  productCount,
  supplierCount,
}: {
  productCount: number
  supplierCount: number
}) {
  return (
    <section
      data-testid="contract-prices-summary"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-xs text-[var(--text-mid)]">Negotiated products</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--text)]">
            {productCount}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-mid)]">Suppliers</p>
          <p className="mt-0.5 font-medium tabular-nums text-[var(--text)]">{supplierCount}</p>
        </div>
      </div>
    </section>
  )
}

export function ContractPricesEmptyIcon() {
  return <Tag className="h-6 w-6" aria-hidden />
}
