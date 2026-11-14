/** Receiving quality is a five-point score; keep aggregate precision out of the UI. */
export function formatQualityScore(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—'
  const score = Number(value)
  if (!Number.isFinite(score) || score < 0 || score > 5) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(score)
}
