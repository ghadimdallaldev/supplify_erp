'use client'
import { OrderLine } from './OrderLine'
import { Icon } from './Icon'
import { useSite, type Role } from './SiteProvider'
import { useReducedMotion } from '@/demo/lib/hooks'

const STATIONS = [
  { label: 'Restaurant' },
  { label: 'Order' },
  { label: 'Supplier' },
  { label: 'Warehouse' },
  { label: 'Delivery' },
]

export function Hero() {
  const { setRole, track } = useSite()
  const reduced = useReducedMotion()
  const explore = (role: Role) => {
    setRole(role)
    track('role_selected', role, role)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .getElementById('experience')
          ?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' })
      )
    )
  }
  return (
    <section className="hero" aria-labelledby="h1">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="event-pill">
            <span /> Meet Supplify at HORECA Beirut 2026 <Icon name="arrow" size={14} />
          </p>
          <h1 id="h1">
            Every order,
            <br />
            <span className="ul">
              one line.
              <svg
                className="ul-svg"
                viewBox="0 0 400 14"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M2 9 C 80 2, 160 13, 240 7 S 360 4, 398 8" pathLength="1" />
              </svg>
            </span>
          </h1>
          <p className="lede">
            A clearer way to run your supply chain. Connect your restaurants, suppliers and
            deliveries in one place.
          </p>
          <p className="hero-capability-note">
            <Icon name="shield" size={15} />
            <span>
              <b>40+ features.</b> Your own workspace. Protected access.
            </span>
          </p>
          <div className="cta-row">
            <button
              type="button"
              className="btn btn-primary"
              aria-label="I’m a Restaurant, explore the walkthrough"
              onClick={() => explore('restaurant')}
            >
              <Icon name="restaurant" size={18} /> I’m a Restaurant <Icon name="arrow" size={17} />
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label="I’m a Supplier, explore the walkthrough"
              onClick={() => explore('supplier')}
            >
              <Icon name="box" size={18} /> I’m a Supplier <Icon name="arrow" size={17} />
            </button>
          </div>
          <button
            type="button"
            className="hero-film-link"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('hx:play-film'))
              document
                .getElementById('film')
                ?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' })
            }}
          >
            <span>
              <Icon name="play" size={12} />
            </span>{' '}
            Get the whole picture in 60 seconds <Icon name="arrow" size={14} />
          </button>
          <div className="hero-footnote">
            Interactive walkthroughs. Sample data. No sign-in needed.
          </div>
        </div>
        <figure className="hero-visual">
          <div className="hero-orbit" aria-hidden="true">
            <svg viewBox="0 0 640 520" fill="none">
              <path
                d="M42 40h400a80 80 0 0 1 80 80v280a60 60 0 0 1-60 60H160a100 100 0 0 1-100-100V120"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="5 7"
              />
              <circle cx="42" cy="40" r="5" fill="currentColor" />
              <circle cx="60" cy="120" r="5" fill="currentColor" />
            </svg>
          </div>
          <div className="hero-order-preview">
            <div className="hero-order-label">
              <span>
                <Icon name="box" size={13} /> Order details
              </span>
              <span className="connection-dot" />
            </div>
            <picture>
              <source media="(min-width: 960px)" srcSet="/demo/assets/shots/hero-order-card.webp" />
              <img
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='927' height='845'/%3E"
                width="927"
                height="845"
                alt="Real supplier order screen with a shipped sample order and its items"
              />
            </picture>
            <div className="hero-order-note">
              <Icon name="check" size={13} /> Same order. Both sides connected.
            </div>
          </div>
          <div className="hero-floating hero-floating-top">
            <span className="float-icon">
              <Icon name="link" size={19} />
            </span>
            <span>
              Both sides.<b>Always connected.</b>
            </span>
            <span className="connection-dot" />
          </div>
          <div className="hero-visual-frame">
            <div className="browser-bar">
              <span className="browser-dots">
                <i />
                <i />
                <i />
              </span>
              <span>
                <Icon name="layers" size={12} /> Supplify / Supplier workspace
              </span>
              <Icon name="globe" size={13} />
            </div>
            <div className="hero-screen-label">
              <span>Clarity for your everyday.</span>
              <span className="sample-tag">Demo environment</span>
            </div>
            <picture>
              <source
                media="(min-width: 960px)"
                srcSet="/demo/assets/shots/supplier-priorities.webp"
              />
              <img
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1592' height='806'/%3E"
                width="1592"
                height="806"
                alt="Supplify supplier Command Center showing order priorities, delivery status and inventory alerts with sample data"
                fetchPriority="high"
              />
            </picture>
            <div className="hero-screen-bottom">
              <span className="tiny-check">
                <Icon name="check" size={12} />
              </span>{' '}
              Orders, stock and deliveries. All in view.
            </div>
          </div>
          <div className="hero-floating hero-floating-bottom">
            <span className="float-icon float-icon-green">
              <Icon name="truck" size={22} />
            </span>
            <span>
              From order to doorstep.<b>A shared view at every step.</b>
            </span>
            <Icon name="check" size={18} />
          </div>
          <figcaption>
            <span /> Real product. Sample data. A clearer way to work.
          </figcaption>
        </figure>
      </div>
      <div className="wrap hero-line-wrap">
        <div className="hero-line-intro">
          <span className="eyebrow">The whole journey.</span>
          <span>One connected line.</span>
        </div>
        <OrderLine
          stations={STATIONS}
          chip
          variant="hero"
          label="The order line: restaurant, order, supplier, warehouse, delivery"
        />
      </div>
    </section>
  )
}

export function FeatureStrip() {
  return (
    <div className="feature-strip">
      <div className="wrap feature-strip-in">
        <p>
          Built around the way
          <br />
          <b>your business works.</b>
        </p>
        <span>
          <Icon name="box" size={23} /> Orders & inventory
        </span>
        <span>
          <Icon name="truck" size={25} /> Fulfillment & delivery
        </span>
        <span>
          <Icon name="link" size={23} /> Relationships that last
        </span>
      </div>
    </div>
  )
}
