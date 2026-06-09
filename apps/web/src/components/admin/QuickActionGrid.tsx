import type { LucideIcon } from 'lucide-react'
import { Button } from '../ui/button'

export type QuickAction = {
  label: string
  tab: string
  icon: LucideIcon
  disabled?: boolean
}

export function QuickActionGrid({
  actions,
  onNavigateTab,
}: {
  actions: QuickAction[]
  onNavigateTab: (tab: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3" data-testid="quick-action-grid">
      {actions.map(({ label, tab, icon: Icon, disabled }) => (
        <Button
          key={tab + label}
          variant="outline"
          disabled={disabled}
          className="box-border h-auto min-h-9 w-full justify-start gap-2 whitespace-normal rounded-lg px-3 py-2 text-[11px] font-medium leading-snug"
          onClick={() => onNavigateTab(tab)}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 text-left">{label}</span>
        </Button>
      ))}
    </div>
  )
}
