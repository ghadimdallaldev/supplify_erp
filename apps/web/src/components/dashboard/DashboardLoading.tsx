import { Skeleton } from '../ui/skeleton'
import { DASHBOARD_STACK_GAP } from './dashboardShared'

export function DashboardLoading() {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: DASHBOARD_STACK_GAP }}
      data-testid="dashboard-page"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton className="h-7 w-48" style={{ background: 'var(--brand-ultra)' }} />
          <Skeleton className="h-4 w-64" style={{ background: 'var(--brand-ultra)' }} />
        </div>
        <Skeleton className="h-8 w-36" style={{ background: 'var(--brand-ultra)' }} />
      </div>
      <div className="dashboard-kpi-grid">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--app-border)',
              borderRadius: 12,
              padding: 15,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <Skeleton className="h-3 w-20" style={{ background: 'var(--brand-ultra)' }} />
            <Skeleton className="h-8 w-16" style={{ background: 'var(--brand-ultra)' }} />
            <Skeleton className="h-6 w-full" style={{ background: 'var(--brand-ultra)' }} />
          </div>
        ))}
      </div>
      <div className="dashboard-content-grid">
        <Skeleton className="h-64 rounded-xl" style={{ background: 'var(--brand-ultra)' }} />
        <Skeleton className="h-64 rounded-xl" style={{ background: 'var(--brand-ultra)' }} />
        <Skeleton className="h-64 rounded-xl" style={{ background: 'var(--brand-ultra)' }} />
      </div>
      <Skeleton className="h-48 rounded-xl" style={{ background: 'var(--brand-ultra)' }} />
    </div>
  )
}
