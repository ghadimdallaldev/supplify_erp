import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { SubscriptionPlan } from '../../../types'

export function dedupeAdminPlans(raw: SubscriptionPlan[] | undefined) {
  return (
    raw?.filter(
      (p, i, arr) =>
        (p.code || '').toLowerCase() !== 'enterprise' &&
        arr.findIndex(
          (x) =>
            x.code === p.code && (x.tenant_type || 'RESTAURANT') === (p.tenant_type || 'RESTAURANT')
        ) === i
    ) ?? []
  )
}

export function AdminTabScrollRow({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })

  const updateFade = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollWidth - el.clientWidth - el.scrollLeft > 2
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    updateFade()
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateFade)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [updateFade])

  return (
    <div className={`relative ${className}`}>
      <div ref={scrollRef} onScroll={updateFade} className="overflow-x-auto">
        {children}
      </div>
      {fade.left && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-lg bg-gradient-to-r from-[var(--bg)] to-transparent"
        />
      )}
      {fade.right && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-lg bg-gradient-to-l from-[var(--bg)] to-transparent"
        />
      )}
    </div>
  )
}

export function AdminTabLoading({ className = 'py-12' }: { className?: string }) {
  return (
    <div className={`flex justify-center text-[var(--text-muted)] ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}

export type AdminTabKey =
  | 'overview'
  | 'activity'
  | 'tenants'
  | 'users'
  | 'subscriptions'
  | 'plans'
  | 'finance'
  | 'usage'
  | 'features'
  | 'deals'
  | 'limits'
  | 'operations'
  | 'health'
  | 'audit'

export type AdminCanTabMap = Record<AdminTabKey, boolean>

export const ADMIN_TENANT_PAGE_SIZE = 50
