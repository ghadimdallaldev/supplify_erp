import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Skeleton } from '../../ui/skeleton'
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

export function AdminTabLoading({ className = 'py-4' }: { className?: string }) {
  return (
    <div className={`space-y-5 ${className}`} data-testid="admin-tab-loading">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-[var(--app-border)] p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-lg border border-[var(--app-border)] p-4">
        <Skeleton className="h-4 w-52" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-[var(--app-border)] p-5">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-lg border border-[var(--app-border)] p-5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
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
