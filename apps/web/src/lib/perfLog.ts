/** Development-only client performance logging (no production spam). */
const enabled = import.meta.env.DEV && import.meta.env.VITE_PERF_LOG !== '0'

export function perfLog(event: string, detail: Record<string, unknown> = {}): void {
  if (!enabled) return
  console.info(`[perf] ${event}`, detail)
}

export function perfMark(name: string): () => void {
  const t0 = performance.now()
  return () => {
    const ms = Math.round(performance.now() - t0)
    perfLog(name, { durationMs: ms })
  }
}
