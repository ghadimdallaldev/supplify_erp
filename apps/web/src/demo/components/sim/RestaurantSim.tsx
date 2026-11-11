'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SUPPLIERS, LIFECYCLE, money } from '@/demo/lib/fixtures'
import { useSite } from '../SiteProvider'
import { useReducedMotion } from '@/demo/lib/hooks'
import { Chip, SimShell, type StepDef } from './SimShell'

const STEPS: StepDef[] = [
  { title: 'Discover suppliers', blurb: 'Find and follow who you buy from' },
  { title: 'Browse products', blurb: "Open a supplier's catalog" },
  { title: 'Build the order', blurb: 'Quantities, one cart' },
  { title: 'Place it', blurb: 'Review and send' },
  { title: 'Track it', blurb: 'Every real status, live' },
  { title: 'Receive it', blurb: 'Confirm what arrived' },
  { title: 'Reorder', blurb: 'The next one takes a few taps' },
]

const TIMES = ['08:02', '08:09', '08:41', '09:15', '09:52', '10:04', '10:05']

export function RestaurantSim() {
  const { openDemo, setRole, track } = useSite()
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const [cart, setCart] = useState<Record<string, number>>({})
  const [status, setStatus] = useState(-1) // -1 = not placed
  const [received, setReceived] = useState<Set<string>>(new Set())
  const [reorder, setReorder] = useState(false)
  const doneFired = useRef(false)

  const supplier = SUPPLIERS.find((s) => s.id === supplierId) ?? null
  const lines = useMemo(
    () => (supplier ? supplier.products.filter((p) => cart[p.id] > 0) : []),
    [supplier, cart]
  )
  const total = lines.reduce((a, p) => a + p.price * cart[p.id], 0)
  const placed = status >= 0

  const go = (n: number) => {
    setStep(n)
    setMaxStep((m) => Math.max(m, n))
    track('walkthrough_step', `r${n + 1}`)
    if (n === STEPS.length - 1 && !doneFired.current) {
      doneFired.current = true
      track('walkthrough_complete', 'restaurant')
    }
  }

  // Step 5: status ticks through the real lifecycle up to Delivered.
  useEffect(() => {
    if (step !== 4 || status < 0 || status >= 4) return
    if (reduced) {
      setStatus(4)
      return
    }
    const t = setTimeout(() => setStatus((s) => s + 1), 1300)
    return () => clearTimeout(t)
  }, [step, status, reduced])

  // Step 6: Received, then Invoiced follows.
  useEffect(() => {
    if (status !== 5) return
    const t = setTimeout(() => setStatus(6), reduced ? 0 : 1100)
    return () => clearTimeout(t)
  }, [status, reduced])

  const add = (id: string, d: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }))

  const canNext = [
    Boolean(supplierId),
    Boolean(supplierId),
    lines.length > 0,
    placed,
    status >= 4,
    status >= 5,
    true,
  ][step]

  let pane
  if (step === 0) {
    pane = (
      <>
        <p className="pane-title">Suppliers in your marketplace</p>
        <p className="pane-help">Tap a supplier to follow it and open its catalog.</p>
        <ul className="cards">
          {SUPPLIERS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="supplier-card"
                data-on={supplierId === s.id}
                aria-pressed={supplierId === s.id}
                onClick={() => {
                  setSupplierId(s.id)
                  setFollowed((f) => new Set(f).add(s.id))
                  setCart({})
                }}
              >
                <span className="sc-mark" aria-hidden="true">
                  {s.name[0]}
                </span>
                <span className="sc-body">
                  <b>{s.name}</b>
                  <small>
                    {s.kind} · {s.city}
                  </small>
                </span>
                <span className={`follow ${followed.has(s.id) ? 'on' : ''}`}>
                  {followed.has(s.id) ? 'Following' : 'Follow'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  } else if (step === 1 && supplier) {
    pane = (
      <>
        <p className="pane-title">{supplier.name}</p>
        <p className="pane-help">Catalog. Tap to add to your cart.</p>
        <ul className="rows">
          {supplier.products.map((p) => (
            <li key={p.id} className="prow">
              <span className="pname">
                <b>{p.name}</b>
                <small>
                  {p.stock} {p.unit} in stock
                </small>
              </span>
              <span className="mono price">
                {money(p.price)}
                <small> / {p.unit}</small>
              </span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => add(p.id, 1)}
                aria-label={`Add ${p.name} to cart`}
              >
                {cart[p.id] ? `In cart · ${cart[p.id]}` : 'Add to cart'}
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  } else if (step === 2 && supplier) {
    pane = (
      <>
        <p className="pane-title">Your cart</p>
        {placed ? (
          <p className="pane-help">This order has been placed. Continue to see it move.</p>
        ) : (
          <p className="pane-help">Adjust quantities. One cart, one order to {supplier.name}.</p>
        )}
        {lines.length === 0 ? (
          <div className="empty">
            <p>Your cart is empty.</p>
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                setCart(
                  Object.fromEntries(supplier.products.slice(0, 3).map((p) => [p.id, p.suggest]))
                )
              }
            >
              Add suggested items
            </button>
          </div>
        ) : (
          <ul className="rows">
            {lines.map((p) => (
              <li key={p.id} className="prow">
                <span className="pname">
                  <b>{p.name}</b>
                  <small>
                    {money(p.price)} / {p.unit}
                  </small>
                </span>
                <span className="stepper">
                  <button
                    type="button"
                    onClick={() => add(p.id, -1)}
                    aria-label={`Fewer ${p.name}`}
                    disabled={placed}
                  >
                    −
                  </button>
                  <output aria-label={`${p.name} quantity`}>{cart[p.id]}</output>
                  <button
                    type="button"
                    onClick={() => add(p.id, 1)}
                    aria-label={`More ${p.name}`}
                    disabled={placed}
                  >
                    +
                  </button>
                </span>
                <span className="mono price">{money(p.price * cart[p.id])}</span>
              </li>
            ))}
            <li className="prow total">
              <span className="pname">
                <b>Total</b>
              </span>
              <span />
              <span className="mono price">{money(total)}</span>
            </li>
          </ul>
        )}
      </>
    )
  } else if (step === 3 && supplier) {
    pane = (
      <>
        <p className="pane-title">Review and place</p>
        <p className="pane-help">
          Delivery to Hamra Bistro, tomorrow morning. Your order is also your purchase order.
        </p>
        <ul className="rows">
          {lines.map((p) => (
            <li key={p.id} className="prow">
              <span className="pname">
                <b>{p.name}</b>
              </span>
              <span className="mono">
                {cart[p.id]} {p.unit}
              </span>
              <span className="mono price">{money(p.price * cart[p.id])}</span>
            </li>
          ))}
          <li className="prow total">
            <span className="pname">
              <b>Total</b>
            </span>
            <span />
            <span className="mono price">{money(total)}</span>
          </li>
        </ul>
        {!placed ? (
          <button type="button" className="btn btn-primary" onClick={() => setStatus(0)}>
            Place order with {supplier.name}
          </button>
        ) : (
          <div className="confirm" role="status">
            <span className="mono">#HB-2041</span> <Chip status="Placed" />{' '}
            <span>Sent to {supplier.name}. They see it the moment it lands.</span>
          </div>
        )}
      </>
    )
  } else if (step === 4) {
    pane = (
      <>
        <p className="pane-title">
          Order <span className="mono">#HB-2041</span> · {supplier?.name}
        </p>
        <ol className="timeline">
          {LIFECYCLE.slice(0, 5).map((s, i) => (
            <li key={s} data-state={i <= status ? 'done' : 'todo'}>
              <span className="mono tl-time">{i <= status ? TIMES[i] : '--:--'}</span>
              <span className="tl-dot" aria-hidden="true" />
              <span className="tl-name">{s}</span>
              {s === 'Shipped' && i <= status && (
                <small>Driver on the way. Estimated arrival shown while out for delivery.</small>
              )}
            </li>
          ))}
        </ol>
        {status >= 3 && status < 4 && (
          <p className="eta">
            Estimated arrival in about 25 minutes{' '}
            <small>(an estimate from the driver&apos;s last location)</small>
          </p>
        )}
        {status < 4 && (
          <button type="button" className="btn btn-small btn-quiet" onClick={() => setStatus(4)}>
            Skip ahead
          </button>
        )}
        {status >= 4 && (
          <div className="confirm" role="status">
            <Chip status="Delivered" />{' '}
            <span>Delivered does not mean received. Confirm what arrived next.</span>
          </div>
        )}
      </>
    )
  } else if (step === 5) {
    const all = lines.every((p) => received.has(p.id))
    pane = (
      <>
        <p className="pane-title">Receiving desk</p>
        <p className="pane-help">Count what arrived and confirm it.</p>
        <ul className="rows">
          {lines.map((p) => (
            <li key={p.id} className="prow">
              <span className="pname">
                <b>{p.name}</b>
                <small>
                  Ordered {cart[p.id]} {p.unit}
                </small>
              </span>
              <span />
              <label className="check">
                <input
                  type="checkbox"
                  checked={received.has(p.id)}
                  disabled={status >= 5}
                  onChange={(e) =>
                    setReceived((r) => {
                      const n = new Set(r)
                      if (e.target.checked) n.add(p.id)
                      else n.delete(p.id)
                      return n
                    })
                  }
                />
                <span>Received</span>
              </label>
            </li>
          ))}
        </ul>
        {status < 5 ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-small btn-quiet"
              onClick={() => setReceived(new Set(lines.map((p) => p.id)))}
            >
              Tick all
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!all}
              onClick={() => setStatus(5)}
            >
              Confirm receipt in full
            </button>
          </div>
        ) : (
          <div className="confirm" role="status">
            <Chip status={LIFECYCLE[status]} />{' '}
            <span>
              {status === 6 ? 'The invoice follows from the same order.' : 'Receipt confirmed.'}
            </span>
          </div>
        )}
      </>
    )
  } else {
    pane = (
      <>
        <p className="pane-title">Ordering lists</p>
        <p className="pane-help">Save a list once. Reorder, or schedule it.</p>
        <div className="listcard">
          <div className="lc-head">
            <b>Weekly kitchen list</b>
            <span className="chip chip-mint">Scheduled</span>
          </div>
          <ul>
            {lines.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <span className="mono">
                  {cart[p.id]} {p.unit}
                </span>
              </li>
            ))}
          </ul>
          {!reorder ? (
            <button type="button" className="btn btn-primary" onClick={() => setReorder(true)}>
              Reorder this list
            </button>
          ) : (
            <div className="confirm" role="status">
              <span className="mono">#HB-2052</span> <Chip status="Placed" />{' '}
              <span>Reordered in two taps.</span>
            </div>
          )}
        </div>
        {reorder && (
          <div className="after">
            <p>That was one order. Imagine your whole week on one line.</p>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => {
                setRole('supplier')
                track('role_selected', 'supplier', 'supplier')
                document.getElementById('experience')?.scrollIntoView()
              }}
            >
              See the supplier side
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <SimShell
      id="sim-restaurant"
      title="Hamra Bistro orders from its suppliers"
      tag="Sample data"
      steps={STEPS}
      step={step}
      maxStep={maxStep}
      onStep={go}
      canNext={canNext}
      onFinish={() => openDemo('restaurant-sim')}
      lifecycleIndex={status}
    >
      {pane}
    </SimShell>
  )
}
