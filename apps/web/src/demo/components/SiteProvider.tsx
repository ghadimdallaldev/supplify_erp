'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DemoDialog } from './DemoDialog'
import type { DemoCampaignRole } from '../../types/demoCampaign'

export type Role = DemoCampaignRole
type Attribution = {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  qr_variant?: string
  landing_role?: string
}

type Ctx = {
  role: Role | null
  setRole: (r: Role | null) => void
  openDemo: (from?: string) => void
  track: (name: string, detail?: string, role?: Role) => void
  attribution: Attribution
}
const SiteCtx = createContext<Ctx | null>(null)
export const useSite = () => {
  const c = useContext(SiteCtx)
  if (!c) throw new Error('SiteProvider missing')
  return c
}

const clean = (v: string | null) => (v && /^[\w\-.:~ +]{1,80}$/.test(v) ? v : undefined)

function readAttribution(): Attribution {
  const p = new URLSearchParams(window.location.search)
  const fresh: Attribution = {
    utm_source: clean(p.get('utm_source')),
    utm_medium: clean(p.get('utm_medium')),
    utm_campaign: clean(p.get('utm_campaign')),
    utm_content: clean(p.get('utm_content')),
  }
  const roleParam = p.get('role')
  if (roleParam === 'restaurant' || roleParam === 'supplier') fresh.landing_role = roleParam
  const hasFresh = Object.values(fresh).some(Boolean)
  try {
    if (hasFresh) sessionStorage.setItem('hx_attr', JSON.stringify(fresh))
    else {
      const s = sessionStorage.getItem('hx_attr')
      if (s) Object.assign(fresh, JSON.parse(s))
    }
  } catch {
    /* storage may be unavailable */
  }
  // QR variant = the utm_content of QR traffic (general | restaurant | supplier).
  if (fresh.utm_source === 'qr' && fresh.utm_content) fresh.qr_variant = fresh.utm_content
  return fresh
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem('hx_sid')
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '')
      sessionStorage.setItem('hx_sid', id)
    }
    return id
  } catch {
    return 'nostore' + Math.random().toString(36).slice(2, 12)
  }
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const [attribution, setAttribution] = useState<Attribution>({})
  const attrRef = useRef<Attribution>({})
  const roleRef = useRef<Role | null>(null)
  const sentVisit = useRef(false)

  const track = useCallback((name: string, detail?: string, roleOverride?: Role) => {
    try {
      const a = attrRef.current
      void fetch('/api/public/demo/events', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Supplify' },
        keepalive: true,
        body: JSON.stringify({
          name,
          sessionId: sessionId(),
          role: roleOverride ?? roleRef.current ?? undefined,
          detail,
          utm_source: a.utm_source,
          utm_medium: a.utm_medium,
          utm_campaign: a.utm_campaign,
          qr_variant: a.qr_variant,
        }),
      }).catch(() => undefined)
    } catch {
      /* analytics must never break the page */
    }
  }, [])

  const setRole = useCallback((r: Role | null) => {
    roleRef.current = r
    setRoleState(r)
  }, [])

  useEffect(() => {
    const a = readAttribution()
    attrRef.current = a
    setAttribution(a)
    if (a.landing_role) setRole(a.landing_role as Role)
    if (!sentVisit.current) {
      sentVisit.current = true
      let seen = false
      try {
        seen = sessionStorage.getItem('hx_visit') === '1'
        sessionStorage.setItem('hx_visit', '1')
      } catch {
        /* ignore */
      }
      if (!seen) track('page_visit')
    }
  }, [track, setRole])

  const openDemo = useCallback(
    (from?: string) => {
      track('form_open', from)
      setDemoOpen(true)
    },
    [track]
  )

  const value = useMemo(
    () => ({ role, setRole, openDemo, track, attribution }),
    [role, setRole, openDemo, track, attribution]
  )
  return (
    <SiteCtx.Provider value={value}>
      {children}
      <DemoDialog open={demoOpen} onClose={() => setDemoOpen(false)} />
    </SiteCtx.Provider>
  )
}
