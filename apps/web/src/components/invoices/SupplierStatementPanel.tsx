import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Filter, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { Skeleton } from '../ui/skeleton'
import { applyReportDatePreset } from '../reports/ReportFiltersBar'
import { useGetSupplierStatementQuery, useGetSuppliersQuery } from '../../services/api'
import { formatCurrency } from '../../utils/format'

const DATE_PRESET_KEYS = [
  { key: 'statement.presets.days7', days: 7 },
  { key: 'statement.presets.days30', days: 30 },
  { key: 'statement.presets.days90', days: 90 },
] as const

function defaultDateRange() {
  return applyReportDatePreset(30)
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg bg-[var(--brand-pale)] border border-[var(--brand-light)] p-3"
    >
      <div className="text-[11px] text-[var(--text-muted)] font-semibold">{label}</div>
      <div className="text-lg font-extrabold mt-1">{value}</div>
    </div>
  )
}

export function SupplierStatementPanel() {
  const { t } = useTranslation('invoices')
  const initialRange = defaultDateRange()
  const [supplierId, setSupplierId] = useState('')
  const [startDate, setStartDate] = useState(initialRange.from)
  const [endDate, setEndDate] = useState(initialRange.to)

  const { data: suppliersData, isLoading: loadingSuppliers } = useGetSuppliersQuery({
    limit: 200,
    offset: 0,
  })
  const suppliers = suppliersData?.suppliers ?? []

  const canFetch = Boolean(supplierId && startDate && endDate)
  const { data, isLoading, isFetching, isError, refetch } = useGetSupplierStatementQuery(
    { supplierId, startDate, endDate },
    { skip: !canFetch }
  )

  const applyPreset = (days: number) => {
    const range = applyReportDatePreset(days)
    setStartDate(range.from)
    setEndDate(range.to)
  }

  const summary = data?.summary
  const selectedSupplier = suppliers.find((s) => s.id === supplierId)

  return (
    <div data-testid="supplier-statement-panel" className="mb-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
        <h3 className="text-sm font-bold text-[var(--text)]">{t('statement.title')}</h3>
      </div>

      <section
        className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
        data-testid="supplier-statement-filters"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
            <p className="text-sm font-semibold text-[var(--text)]">
              {t('statement.filtersTitle')}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {DATE_PRESET_KEYS.map((preset) => (
              <Button
                key={preset.days}
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => applyPreset(preset.days)}
              >
                {t('statement.lastPreset', { period: t(preset.key) })}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label
              htmlFor="statement-supplier"
              className="text-xs font-medium text-[var(--text-mid)]"
            >
              {t('statement.supplier')}
            </Label>
            {loadingSuppliers ? (
              <Skeleton className="mt-1 h-10 w-full rounded-md" />
            ) : (
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="statement-supplier" className="mt-1">
                  <option value="">{t('statement.selectSupplier')}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            )}
          </div>
          <div>
            <Label htmlFor="statement-from" className="text-xs font-medium text-[var(--text-mid)]">
              {t('statement.from')}
            </Label>
            <Input
              id="statement-from"
              type="date"
              className="mt-1"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="statement-to" className="text-xs font-medium text-[var(--text-mid)]">
              {t('statement.to')}
            </Label>
            <Input
              id="statement-to"
              type="date"
              className="mt-1"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </section>

      {!canFetch ? (
        <div
          data-testid="supplier-statement-prompt"
          className="rounded-xl border border-dashed border-[var(--app-border)] px-4 py-5 text-sm text-[var(--text-muted)]"
        >
          {t('statement.prompt')}
        </div>
      ) : isLoading || isFetching ? (
        <div
          data-testid="supplier-statement-loading"
          className="grid gap-3 grid-cols-2 sm:grid-cols-5"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div
          data-testid="supplier-statement-error"
          className="rounded-xl border border-[var(--app-border)] p-4 text-center"
          role="alert"
        >
          <AlertTriangle className="h-5 w-5 mx-auto text-[var(--brand)] mb-2" />
          <p className="text-sm text-[var(--text-muted)]">{t('statement.loadError')}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
            {t('statement.retry')}
          </Button>
        </div>
      ) : summary ? (
        <div className="space-y-3">
          {selectedSupplier && (
            <p className="text-xs text-[var(--text-muted)]">
              {t('statement.statementFor')}{' '}
              <span className="font-semibold text-[var(--text)]">{selectedSupplier.name}</span>
              {' · '}
              {t('statement.dateRange', { from: startDate, to: endDate })}
              {summary.invoiceCount != null && (
                <>
                  {' · '}
                  {t('statement.invoiceCount', { count: summary.invoiceCount })}
                </>
              )}
            </p>
          )}

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label={t('statement.openingBalance')}
              value={formatCurrency(summary.openingBalance)}
              testId="statement-opening"
            />
            <Stat
              label={t('statement.charges')}
              value={formatCurrency(summary.totalCharges)}
              testId="statement-charges"
            />
            <Stat
              label={t('statement.payments')}
              value={formatCurrency(summary.totalPayments)}
              testId="statement-payments"
            />
            <Stat
              label={t('statement.adjustments')}
              value={formatCurrency(summary.totalAdjustments)}
              testId="statement-adjustments"
            />
            <Stat
              label={t('statement.closingBalance')}
              value={formatCurrency(summary.closingBalance)}
              testId="statement-closing"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
