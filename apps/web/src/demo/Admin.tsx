import { useEffect, useState } from 'react'
import { LeadRow, type AdminLead } from './AdminLeadRow'

type Summary = {
  events: { name: string; variant: string; sessions: number }[]
  leads: { variant: string; leads: number }[]
}
const FUNNEL = [
  ['page_visit', 'Visits'],
  ['role_selected', 'Role chosen'],
  ['video_start', 'Film started'],
  ['video_complete', 'Film completed'],
  ['walkthrough_complete', 'Walkthrough done'],
  ['form_open', 'Form opened'],
  ['form_submit', 'Form submitted'],
]

export default function Admin() {
  const [leads, setLeads] = useState<AdminLead[]>([])
  const [summary, setSummary] = useState<Summary>({ events: [], leads: [] })
  const [state, setState] = useState<'loading' | 'ready' | 'login' | 'forbidden' | 'error'>(
    'loading'
  )
  async function load() {
    setState('loading')
    try {
      const response = await fetch('/api/admin-dashboard/demo/leads', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!response.ok) {
        setState(
          response.status === 401 ? 'login' : response.status === 403 ? 'forbidden' : 'error'
        )
        return
      }
      const overview = await fetch('/api/admin-dashboard/demo/summary', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!overview.ok) {
        setState('error')
        return
      }
      setLeads((await response.json()).data)
      setSummary((await overview.json()).data)
      setState('ready')
    } catch {
      setState('error')
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const total = summary.leads.reduce((n, r) => n + r.leads, 0)
  const visits = summary.events
    .filter((r) => r.name === 'page_visit')
    .reduce((n, r) => n + r.sessions, 0)
  const variants = [
    ...new Set([...summary.events.map((r) => r.variant), ...summary.leads.map((r) => r.variant)]),
  ].sort()
  return (
    <main className="admin">
      <header className="admin-head">
        <h1>Campaign admin</h1>
        <div>
          <a className="admin-btn" href="/demo/">
            View demo
          </a>
          <a className="admin-btn" href="/app/admin">
            Supplify admin
          </a>
          {state === 'ready' && (
            <a className="admin-btn" href="/api/admin-dashboard/demo/export.csv">
              Export CSV
            </a>
          )}
        </div>
      </header>
      {state === 'loading' && <p role="status">Loading campaign data…</p>}
      {state === 'login' && (
        <p>
          Sign in to Supplify with your admin account, then return to this page.{' '}
          <a href="/login">Sign in</a>
        </p>
      )}
      {state === 'forbidden' && (
        <p role="alert">
          Your account does not have access to campaign leads. A Supplify administrator can manage
          your access.
        </p>
      )}
      {state === 'error' && (
        <p role="alert">
          Campaign data could not be loaded.{' '}
          <button type="button" className="admin-btn" onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}
      {state === 'ready' && (
        <>
          <section aria-labelledby="campaign-summary">
            <h2 id="campaign-summary">Conversion summary</h2>
            <div className="admin-funnel">
              {FUNNEL.map(([key, label]) => (
                <div key={key}>
                  <b>
                    {summary.events
                      .filter((r) => r.name === key)
                      .reduce((n, r) => n + r.sessions, 0)}
                  </b>
                  <span>{label}</span>
                </div>
              ))}
              <div>
                <b>{total}</b>
                <span>Leads stored</span>
              </div>
              <div>
                <b>{visits ? `${((total / visits) * 100).toFixed(1)}%` : '—'}</b>
                <span>Visit to lead</span>
              </div>
            </div>
            <table className="admin-table" aria-label="Campaign source variants">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Visits</th>
                  <th>Walkthroughs</th>
                  <th>Leads</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v}>
                    <td>{v}</td>
                    <td>
                      {summary.events.find((r) => r.variant === v && r.name === 'page_visit')
                        ?.sessions || 0}
                    </td>
                    <td>
                      {summary.events.find(
                        (r) => r.variant === v && r.name === 'walkthrough_complete'
                      )?.sessions || 0}
                    </td>
                    <td>{summary.leads.find((r) => r.variant === v)?.leads || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section aria-labelledby="campaign-leads">
            <h2 id="campaign-leads">Leads ({total})</h2>
            {leads.length ? (
              <>
                <p>
                  Showing the latest {leads.length} requests. Export CSV for up to 10,000 records.
                </p>
                <div className="admin-leads">
                  {leads.map((lead) => (
                    <LeadRow key={lead.id} lead={lead} />
                  ))}
                </div>
              </>
            ) : (
              <p>No demo requests yet.</p>
            )}
          </section>
        </>
      )}
    </main>
  )
}
