'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSite, type Role } from './SiteProvider'

const LOCATIONS = [
  ['1', '1 location'],
  ['2-5', '2 to 5'],
  ['6-15', '6 to 15'],
  ['16+', 'More than 15'],
]
const CUSTOMERS = [
  ['1-10', 'Up to 10'],
  ['11-50', '11 to 50'],
  ['51-200', '51 to 200'],
  ['200+', 'More than 200'],
]

type Result = { kind: 'ok'; duplicate: boolean; name: string } | null

export function DemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { role: siteRole, track, attribution } = useSite()
  const [role, setRole] = useState<Role | ''>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setRole((r) => r || siteRole || '')
      setResult(null)
      setErrors({})
      setFormError('')
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open, siteRole])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const f = new FormData(e.currentTarget)
    const str = (k: string) => String(f.get(k) ?? '')
    const payload = {
      name: str('name'),
      company: str('company'),
      role: role || undefined,
      whatsapp: str('whatsapp'),
      email: str('email') || undefined,
      locations: role === 'restaurant' ? str('locations') || undefined : undefined,
      restaurantCustomers:
        role === 'supplier' ? str('restaurantCustomers') || undefined : undefined,
      consent: f.get('consent') === 'on',
      website: str('website'),
      ...attribution,
    }
    setBusy(true)
    setFormError('')
    try {
      const res = await fetch('/api/public/demo/leads', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Supplify' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        track('form_submit', role || undefined)
        setErrors({})
        setResult({
          kind: 'ok',
          duplicate: Boolean(data.duplicate),
          name: payload.name.split(' ')[0],
        })
      } else {
        const fields: Record<string, string> = data.fields ?? {}
        setErrors(fields)
        setFormError(
          (typeof data.error === 'string' ? data.error : data.error?.message) ||
            'Something went wrong. Please try again.'
        )
        const first = Object.keys(fields)[0]
        if (first)
          requestAnimationFrame(() =>
            (ref.current?.querySelector(`[name="${first}"]`) as HTMLElement | null)?.focus()
          )
      }
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const err = (k: string) =>
    errors[k] ? (
      <p className="field-err" id={`err-${k}`} role="alert">
        {errors[k]}
      </p>
    ) : null
  const aria = (k: string) => ({
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `err-${k}` : undefined,
  })

  return (
    <dialog
      ref={ref}
      className="demo-dialog"
      aria-labelledby="demo-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="demo-panel">
        <button type="button" className="demo-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M4 4l12 12M16 4L4 16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {result ? (
          <div className="demo-done" data-testid="demo-success">
            <p className="eyebrow">Request received</p>
            <h2 id="demo-title">
              {result.duplicate ? 'We already have your details.' : `Thank you, ${result.name}.`}
            </h2>
            <p>
              {result.duplicate
                ? 'This number is already on our list. Someone from the Supplify team will reach out on WhatsApp.'
                : 'Your request is with the Supplify team. We will reach out on WhatsApp to arrange your personal demo. Nothing is scheduled yet.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Back to the site
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate data-testid="demo-form">
            <p className="eyebrow">Personal demo</p>
            <h2 id="demo-title">See Supplify with your own business in mind.</h2>
            <p className="demo-lede">
              Leave your details and the Supplify team will contact you on WhatsApp to arrange a
              walkthrough.
            </p>

            <fieldset className="role-pick">
              <legend>I am a</legend>
              {(['restaurant', 'supplier'] as const).map((r) => (
                <label key={r} className={role === r ? 'on' : ''}>
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    {...aria('role')}
                  />
                  <span>{r === 'restaurant' ? 'Restaurant' : 'Supplier'}</span>
                </label>
              ))}
              {err('role')}
            </fieldset>

            <div className="field">
              <label htmlFor="f-name">Your name</label>
              <input id="f-name" name="name" autoComplete="name" required {...aria('name')} />
              {err('name')}
            </div>
            <div className="field">
              <label htmlFor="f-company">
                {role === 'supplier' ? 'Company' : 'Restaurant or group'}
              </label>
              <input
                id="f-company"
                name="company"
                autoComplete="organization"
                required
                {...aria('company')}
              />
              {err('company')}
            </div>
            <div className="field">
              <label htmlFor="f-wa">WhatsApp number</label>
              <input
                id="f-wa"
                name="whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+961 71 123 456"
                required
                {...aria('whatsapp')}
              />
              {err('whatsapp')}
            </div>

            {role === 'restaurant' && (
              <div className="field">
                <label htmlFor="f-loc">Roughly how many locations do you run?</label>
                <select id="f-loc" name="locations" defaultValue="" {...aria('locations')}>
                  <option value="" disabled>
                    Select
                  </option>
                  {LOCATIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                {err('locations')}
              </div>
            )}
            {role === 'supplier' && (
              <div className="field">
                <label htmlFor="f-cust">Roughly how many restaurants do you serve?</label>
                <select
                  id="f-cust"
                  name="restaurantCustomers"
                  defaultValue=""
                  {...aria('restaurantCustomers')}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {CUSTOMERS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                {err('restaurantCustomers')}
              </div>
            )}

            <div className="field">
              <label htmlFor="f-email">
                Email <span className="opt">(optional)</span>
              </label>
              <input
                id="f-email"
                name="email"
                type="email"
                autoComplete="email"
                {...aria('email')}
              />
              {err('email')}
            </div>

            {/* Honeypot: hidden from people and assistive tech. */}
            <div className="hp" aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className="consent">
              <input id="f-consent" name="consent" type="checkbox" {...aria('consent')} />
              <label htmlFor="f-consent">
                I agree that Supplify may contact me about a demo using these details, including on
                WhatsApp. I can ask to be removed at any time.
              </label>
            </div>
            {err('consent')}
            <p className="privacy-note" id="privacy">
              Privacy: we store the details you enter here and which campaign link you came from,
              only to follow up on your request. We do not sell them. Site analytics are anonymous
              page and step counts with no cookies and no IP addresses.
            </p>

            {formError && (
              <p className="form-err" role="alert">
                {formError}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Sending…' : 'Request a personal demo'}
            </button>
          </form>
        )}
      </div>
    </dialog>
  )
}
