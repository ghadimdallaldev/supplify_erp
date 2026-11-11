'use client'
import { useEffect, useRef, useState } from 'react'
import { INCOMING_ORDER, DRIVERS, CUSTOMERS, money } from '@/demo/lib/fixtures'
import { useSite } from '../SiteProvider'
import { useReducedMotion } from '@/demo/lib/hooks'
import { Chip, SimShell, type StepDef } from './SimShell'

const STEPS: StepDef[] = [
  { title: 'An order arrives', blurb: 'It lands the moment it is placed' },
  { title: 'Review and accept', blurb: 'One tap to acknowledge' },
  { title: 'Check stock', blurb: 'Know before you promise' },
  { title: 'Prepare', blurb: 'Start processing, pick the order' },
  { title: 'Assign a driver', blurb: 'Your own team, your own run' },
  { title: 'Status updates', blurb: 'The restaurant follows along' },
  { title: 'Know your customers', blurb: 'Who is ordering, who is due' },
]
const DRIVER_STATES = ['Assigned', 'Picked up', 'Out for delivery', 'Delivered']

export function SupplierSim() {
  const { openDemo, setRole, track } = useSite()
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [arrived, setArrived] = useState(false)
  const [opened, setOpened] = useState(false)
  const [status, setStatus] = useState(0) // lifecycle index of the order
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(INCOMING_ORDER.lines.map((l) => [l.id, l.qty]))
  )
  const [reserved, setReserved] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [driver, setDriver] = useState<string | null>(null)
  const [dstate, setDstate] = useState(0)
  const [customer, setCustomer] = useState<string | null>('byblos')
  const doneFired = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setArrived(true), reduced ? 0 : 900)
    return () => clearTimeout(t)
  }, [reduced])

  const go = (n: number) => {
    setStep(n)
    setMaxStep((m) => Math.max(m, n))
    track('walkthrough_step', `s${n + 1}`)
    if (n === STEPS.length - 1 && !doneFired.current) {
      doneFired.current = true
      track('walkthrough_complete', 'supplier')
    }
  }

  const short = INCOMING_ORDER.lines.filter((l) => qty[l.id] > l.onHand)
  const total = INCOMING_ORDER.lines.reduce((a, l) => a + l.price * qty[l.id], 0)
  const processing = status >= 2
  const allPicked = INCOMING_ORDER.lines.every((l) => picked.has(l.id))

  const canNext = [
    opened,
    status >= 1,
    reserved,
    processing && allPicked,
    status >= 3,
    status >= 4,
    true,
  ][step]

  let pane
  if (step === 0) {
    pane = (
      <>
        <p className="pane-title">Orders inbox · Cedar Fresh Produce</p>
        <div className="inbox" aria-live="polite">
          {!arrived ? (
            <p className="pane-help">Waiting for orders…</p>
          ) : (
            <button
              type="button"
              className="inbox-row"
              data-new={!opened}
              onClick={() => setOpened(true)}
            >
              <span className="mono">{INCOMING_ORDER.id}</span>
              <span className="ib-main">
                <b>{INCOMING_ORDER.customer}</b>
                <small>
                  {INCOMING_ORDER.lines.length} items · {money(total)}
                </small>
              </span>
              <Chip status="Placed" />
              <span className="ib-act">{opened ? 'Opened' : 'Open order'}</span>
            </button>
          )}
        </div>
        {arrived && (
          <p className="toast" role="status">
            New order from {INCOMING_ORDER.customer}
          </p>
        )}
      </>
    )
  } else if (step === 1) {
    pane = (
      <>
        <p className="pane-title">
          Order <span className="mono">{INCOMING_ORDER.id}</span> · {INCOMING_ORDER.customer}
        </p>
        <ul className="rows">
          {INCOMING_ORDER.lines.map((l) => (
            <li key={l.id} className="prow">
              <span className="pname">
                <b>{l.name}</b>
              </span>
              <span className="mono">
                {l.qty} {l.unit}
              </span>
              <span className="mono price">{money(l.price * l.qty)}</span>
            </li>
          ))}
        </ul>
        {status < 1 ? (
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => setStatus(1)}>
              Accept order
            </button>
            <DeclineNote />
          </div>
        ) : (
          <div className="confirm" role="status">
            <Chip status="Acknowledged" /> <span>The restaurant is told straight away.</span>
          </div>
        )}
      </>
    )
  } else if (step === 2) {
    pane = (
      <>
        <p className="pane-title">Stock check</p>
        <p className="pane-help">Ordered quantity against what is on hand.</p>
        <ul className="rows">
          {INCOMING_ORDER.lines.map((l) => {
            const isShort = qty[l.id] > l.onHand
            return (
              <li key={l.id} className="prow">
                <span className="pname">
                  <b>{l.name}</b>
                  <small>
                    Ordered {qty[l.id]} · on hand {l.onHand} {l.unit}
                  </small>
                </span>
                {isShort ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setQty((q) => ({ ...q, [l.id]: l.onHand }))}
                  >
                    Ship {l.onHand} {l.unit}
                  </button>
                ) : (
                  <span />
                )}
                <span className={`chip ${isShort ? 'chip-amber' : 'chip-mint'}`}>
                  {isShort
                    ? `Short by ${qty[l.id] - l.onHand}`
                    : reserved
                      ? 'Reserved'
                      : 'In stock'}
                </span>
              </li>
            )
          })}
        </ul>
        {!reserved ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={short.length > 0}
              onClick={() => setReserved(true)}
            >
              Reserve stock
            </button>
            {short.length > 0 && <span className="sim-hint">Resolve the short line first</span>}
          </div>
        ) : (
          <div className="confirm" role="status">
            <span>Stock reserved for this order. Nothing else can promise it.</span>
          </div>
        )}
      </>
    )
  } else if (step === 3) {
    pane = (
      <>
        <p className="pane-title">Pick list</p>
        {!processing ? (
          <button type="button" className="btn btn-primary" onClick={() => setStatus(2)}>
            Start processing
          </button>
        ) : (
          <div className="confirm" role="status">
            <Chip status="Processing" /> <span>Tick each line as it is picked.</span>
          </div>
        )}
        <ul className="rows" aria-label="Pick list">
          {INCOMING_ORDER.lines.map((l) => (
            <li key={l.id} className="prow">
              <span className="pname">
                <b>{l.name}</b>
              </span>
              <span className="mono">
                {qty[l.id]} {l.unit}
              </span>
              <label className="check">
                <input
                  type="checkbox"
                  disabled={!processing}
                  checked={picked.has(l.id)}
                  onChange={(e) =>
                    setPicked((p) => {
                      const n = new Set(p)
                      if (e.target.checked) n.add(l.id)
                      else n.delete(l.id)
                      return n
                    })
                  }
                />
                <span>Picked</span>
              </label>
            </li>
          ))}
        </ul>
      </>
    )
  } else if (step === 4) {
    pane = (
      <>
        <p className="pane-title">Assign a driver</p>
        <p className="pane-help">Drivers see only their own assigned deliveries.</p>
        <ul className="cards">
          {DRIVERS.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="supplier-card"
                data-on={driver === d.id}
                aria-pressed={driver === d.id}
                disabled={status >= 3}
                onClick={() => setDriver(d.id)}
              >
                <span className="sc-mark" aria-hidden="true">
                  {d.name[0]}
                </span>
                <span className="sc-body">
                  <b>{d.name}</b>
                  <small>{d.note} · available</small>
                </span>
                <span className={`follow ${driver === d.id ? 'on' : ''}`}>
                  {driver === d.id ? 'Selected' : 'Select'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {status < 3 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!driver}
            onClick={() => {
              setStatus(3)
              setDstate(0)
            }}
          >
            Assign and ship
          </button>
        ) : (
          <div className="confirm" role="status">
            <Chip status="Shipped" />{' '}
            <span>
              Assigned to {DRIVERS.find((d) => d.id === driver)?.name}. The run is on the road
              sheet.
            </span>
          </div>
        )}
      </>
    )
  } else if (step === 5) {
    pane = (
      <div className="split">
        <div>
          <p className="pane-title">Driver app</p>
          <ol className="timeline">
            {DRIVER_STATES.map((s, i) => (
              <li key={s} data-state={i <= dstate ? 'done' : 'todo'}>
                <span className="tl-dot" aria-hidden="true" />
                <span className="tl-name">{s}</span>
              </li>
            ))}
          </ol>
          {dstate < 3 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const n = dstate + 1
                setDstate(n)
                if (n === 3) setStatus(4)
              }}
            >
              Driver taps: {DRIVER_STATES[dstate + 1]}
            </button>
          ) : null}
        </div>
        <div className="mirror">
          <p className="eyebrow">What {INCOMING_ORDER.customer} sees</p>
          <p className="mono">{INCOMING_ORDER.id}</p>
          <Chip status={status >= 4 ? 'Delivered' : 'Shipped'} />
          <p className="eta">
            {dstate === 2 ? (
              <>
                Out for delivery. Estimated arrival in about 20 minutes{' '}
                <small>(an estimate from the driver&apos;s last location)</small>
              </>
            ) : dstate === 3 ? (
              'Delivered. The restaurant confirms receipt on its side.'
            ) : dstate === 1 ? (
              'Picked up from the warehouse.'
            ) : (
              'Assigned to a driver.'
            )}
          </p>
        </div>
      </div>
    )
  } else {
    const c = CUSTOMERS.find((x) => x.id === customer)
    pane = (
      <>
        <p className="pane-title">Your restaurants</p>
        <p className="pane-help">Who is ordering, and who is due to reorder.</p>
        <ul className="rows">
          {CUSTOMERS.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                className="prow rowbtn"
                aria-expanded={customer === x.id}
                onClick={() => setCustomer(x.id)}
              >
                <span className="pname">
                  <b>{x.name}</b>
                  <small>
                    {x.kind} · last order {x.last.toLowerCase()}
                  </small>
                </span>
                <span className={`chip ${x.due ? 'chip-amber' : 'chip-mint'}`}>
                  {x.due ? 'Due to reorder' : 'Active'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {c && (
          <p className="confirm" role="status">
            <b>{c.name}</b> · {c.rhythm}.{c.due ? ' A good moment to reach out.' : ''}
          </p>
        )}
        <div className="after">
          <p>Orders, stock, drivers and customers. One line, in your hands.</p>
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => {
              setRole('restaurant')
              track('role_selected', 'restaurant', 'restaurant')
              document.getElementById('experience')?.scrollIntoView()
            }}
          >
            See the restaurant side
          </button>
        </div>
      </>
    )
  }

  return (
    <SimShell
      id="sim-supplier"
      title="Cedar Fresh Produce runs the day"
      tag="Sample data"
      steps={STEPS}
      step={step}
      maxStep={maxStep}
      onStep={go}
      canNext={canNext}
      onFinish={() => openDemo('supplier-sim')}
      lifecycleIndex={arrived ? status : -1}
    >
      {pane}
    </SimShell>
  )
}

function DeclineNote() {
  const [shown, setShown] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-quiet" onClick={() => setShown(true)}>
        Decline
      </button>
      {shown && (
        <span className="sim-hint" role="status">
          Declining sends it back to the restaurant. For this walkthrough, accept.
        </span>
      )}
    </>
  )
}
