import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Filter } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { cn } from '../../lib/utils'
import { ensureNamespace } from '../../i18n'

const DATE_PRESET_KEYS = [
  { key: 'days7', days: 7 },
  { key: 'days30', days: 30 },
  { key: 'days90', days: 90 },
] as const

type Props = {
  from: string
  to: string
  granularity: string
  branchId: string
  branches: Array<{ id: string; name: string }>
  showBranchFilter: boolean
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onGranularityChange: (value: string) => void
  onBranchChange: (value: string) => void
  onPresetDays: (days: number) => void
}

export function ReportFiltersBar({
  from,
  to,
  granularity,
  branchId,
  branches,
  showBranchFilter,
  onFromChange,
  onToChange,
  onGranularityChange,
  onBranchChange,
  onPresetDays,
}: Props) {
  const { t } = useTranslation('reports')

  useEffect(() => {
    void ensureNamespace('reports')
  }, [])

  return (
    <section
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
      data-testid="report-filters"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
          <p className="text-sm font-semibold text-[var(--text)]">{t('filters.title')}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {DATE_PRESET_KEYS.map((preset) => (
            <Button
              key={preset.days}
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => onPresetDays(preset.days)}
            >
              {t('filters.lastPreset', { period: t(`filters.presets.${preset.key}`) })}
            </Button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          'grid grid-cols-1 gap-3 sm:grid-cols-2',
          showBranchFilter ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        )}
      >
        <div>
          <Label htmlFor="report-from" className="text-xs font-medium text-[var(--text-mid)]">
            {t('filters.from')}
          </Label>
          <Input
            id="report-from"
            type="date"
            className="mt-1"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="report-to" className="text-xs font-medium text-[var(--text-mid)]">
            {t('filters.to')}
          </Label>
          <Input
            id="report-to"
            type="date"
            className="mt-1"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
        <div>
          <Label
            htmlFor="report-granularity"
            className="text-xs font-medium text-[var(--text-mid)]"
          >
            {t('filters.granularity')}
          </Label>
          <Select value={granularity} onValueChange={onGranularityChange}>
            <SelectTrigger id="report-granularity" className="mt-1">
              <option value="day">{t('filters.granularityOptions.day')}</option>
              <option value="week">{t('filters.granularityOptions.week')}</option>
              <option value="month">{t('filters.granularityOptions.month')}</option>
            </SelectTrigger>
          </Select>
        </div>
        {showBranchFilter ? (
          <div>
            <Label htmlFor="report-branch" className="text-xs font-medium text-[var(--text-mid)]">
              {t('filters.branch')}
            </Label>
            <Select value={branchId} onValueChange={onBranchChange}>
              <SelectTrigger id="report-branch" className="mt-1">
                <option value="">{t('filters.allBranches')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectTrigger>
            </Select>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function applyReportDatePreset(days: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}
