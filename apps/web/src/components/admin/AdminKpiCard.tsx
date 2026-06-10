// Shared implementation lives in ui/kpi-card so tenant pages can use it
// without pulling anything admin-scoped into their bundle.
export { KpiCard as AdminKpiCard, type KpiTone } from '../ui/kpi-card'
