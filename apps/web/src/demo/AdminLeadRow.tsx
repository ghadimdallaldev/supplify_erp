'use client'
import { useState } from 'react'

export type AdminLead = {
  id: number
  createdAt: string
  name: string
  company: string
  role: string
  whatsapp: string
  email: string | null
  size: string
  source: string
  status: string
  notes: string
}
const STATUSES = ['new', 'contacted', 'qualified', 'demo_done', 'not_a_fit']

export function LeadRow({ lead }: { lead: AdminLead }) {
  const [status, setStatus] = useState(lead.status)
  const [notes, setNotes] = useState(lead.notes)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function save(patch: { status?: string; notes?: string }) {
    setState('saving')
    const res = await fetch(`/api/admin-dashboard/demo/leads/${lead.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Supplify' },
      body: JSON.stringify(patch),
    })
    setState(res.ok ? 'saved' : 'error')
  }

  return (
    <article className="admin-lead" data-testid="lead">
      <div className="admin-lead-main">
        <strong>{lead.company}</strong> <span className="admin-tag">{lead.role}</span>
        <div>
          {lead.name} ·{' '}
          <a href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`} rel="noreferrer">
            {lead.whatsapp}
          </a>
          {lead.email ? <> · {lead.email}</> : null}
        </div>
        <small>
          {new Date(lead.createdAt).toLocaleString('en-GB')} · {lead.size} · {lead.source}
        </small>
      </div>
      <label>
        <span className="sr">Status</span>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            void save({ status: e.target.value })
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-notes">
        <span className="sr">Notes</span>
        <textarea
          value={notes}
          rows={2}
          placeholder="Notes"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== lead.notes && void save({ notes })}
        />
      </label>
      <small aria-live="polite">
        {state === 'saving'
          ? 'Saving…'
          : state === 'saved'
            ? 'Saved'
            : state === 'error'
              ? 'Save failed'
              : ''}
      </small>
    </article>
  )
}
