'use client'
import { useSite, type Role } from './SiteProvider'
import { useReducedMotion } from '@/demo/lib/hooks'
import { Icon } from './Icon'

const WORLDS: { role: Role; title: string; line: string; points: string[] }[] = [
  {
    role: 'supplier',
    title: "I'm a Supplier",
    line: 'Serve your restaurant customers, promote your goods, and keep orders moving in one place.',
    points: [
      'Orders arrive organised',
      'Stock, pick lists, drivers',
      'See who is ordering and who is due',
      'Promote products with Deals and Boosts',
    ],
  },
  {
    role: 'restaurant',
    title: "I'm a Restaurant",
    line: 'Order from your suppliers in one place and watch every order move.',
    points: [
      'Find and follow suppliers',
      'Clear status to your door',
      'Reorder in a few taps',
      'Access tailored to your team',
    ],
  },
]

export function World() {
  const { role, setRole, track } = useSite()
  const reduced = useReducedMotion()

  function choose(r: Role) {
    track('role_selected', r, r)
    setRole(r)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .getElementById('experience')
          ?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' })
      )
    )
  }

  return (
    <section className="world" id="world" aria-labelledby="world-h">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">
            <span className="section-number">02</span> Two sides. One connection.
          </p>
          <h2 id="world-h">
            Your world.
            <br />
            <em>Better connected.</em>
          </h2>
          <p className="section-lede">
            Step into your side of Supplify. Follow an order, try the tools, and see how it all
            comes together.
          </p>
        </div>
        <div className="world-grid">
          {WORLDS.map((w) => (
            <button
              key={w.role}
              type="button"
              className="world-card"
              data-role={w.role}
              data-selected={role === w.role}
              aria-pressed={role === w.role}
              onClick={() => choose(w.role)}
            >
              <span className="world-card-top">
                <span className="world-icon">
                  <Icon name={w.role === 'supplier' ? 'box' : 'restaurant'} size={27} />
                </span>
                <span className="eyebrow">
                  {w.role === 'supplier'
                    ? 'Suppliers & distributors'
                    : 'Restaurants, hotels & groups'}
                </span>
                <span className="world-index" aria-hidden="true">
                  {w.role === 'supplier' ? '01' : '02'}
                </span>
              </span>
              <span className="world-title">{w.title}</span>
              <span className="world-line">{w.line}</span>
              <span className="world-mini" aria-hidden="true">
                <span className="world-mini-icon">
                  <Icon name={w.role === 'supplier' ? 'layers' : 'truck'} size={19} />
                </span>
                <span>
                  <b>
                    {w.role === 'supplier' ? 'Your next order is here.' : 'Know what’s on the way.'}
                  </b>
                  <small>
                    {w.role === 'supplier'
                      ? 'Review. Prepare. Send it on its way.'
                      : 'From your supplier to your door.'}
                  </small>
                </span>
                <span className={`chip ${w.role === 'supplier' ? 'chip-violet' : 'chip-mint'}`}>
                  {w.role === 'supplier' ? 'Placed' : 'Shipped'}
                </span>
              </span>
              <ul>
                {w.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <span className="world-go">
                {role === w.role ? 'Selected. See your walkthrough' : 'Enter this world'}
                <span className="world-arrow">
                  <Icon name="arrow" size={21} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
