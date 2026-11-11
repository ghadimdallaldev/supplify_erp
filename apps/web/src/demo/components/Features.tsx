'use client'
import { Icon } from './Icon'
import { useSite } from './SiteProvider'

const FEATURES = [
  {
    icon: 'box' as const,
    title: 'Ordering, without the back-and-forth.',
    text: 'Browse supplier catalogs, build your order and reorder from saved lists. One place to keep your purchasing moving.',
    detail: 'Discover · Order · Reorder',
    tone: 'violet',
  },
  {
    icon: 'layers' as const,
    title: 'Know what you can promise.',
    text: 'Review incoming orders, check available stock, reserve it and prepare your pick list before dispatch.',
    detail: 'Accept · Reserve · Prepare',
    tone: 'amber',
  },
  {
    icon: 'truck' as const,
    title: 'Keep every delivery in view.',
    text: 'Assign your own drivers, follow order status and confirm what arrived. A connected journey all the way to receiving.',
    detail: 'Dispatch · Track · Receive',
    tone: 'green',
  },
  {
    icon: 'megaphone' as const,
    title: 'Give your products the spotlight.',
    text: 'Create product deals for restaurants that follow you. Reach new restaurant customers with sponsored boosts, and see how your offers perform.',
    detail: 'Deals · Boosts · Promotion insights',
    tone: 'amber',
  },
  {
    icon: 'building' as const,
    title: 'Your business. Its own space.',
    text: 'Your own workspace, team and business records. Manage linked branches while keeping each business account’s operations separate.',
    detail: 'Private workspaces · Linked branches',
    tone: 'violet',
  },
  {
    icon: 'shield' as const,
    title: 'Strong security. Clear control.',
    text: 'Protected sign-in, access by team role and activity logs help you control who can see your business information and what they can do.',
    detail: 'Protected access · Team permissions',
    tone: 'green',
  },
]

export function Features() {
  const { openDemo } = useSite()
  return (
    <section className="features" id="features" aria-labelledby="features-h">
      <div className="wrap">
        <div className="section-head centered">
          <p className="eyebrow">
            <span className="section-number">01</span> Built for your everyday
          </p>
          <h2 id="features-h">
            Less chasing.
            <br />
            <em>More moving forward.</em>
          </h2>
          <p className="section-lede">
            The tools that bring your supply chain together. From the people placing an order to the
            team delivering it.
          </p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((feature, i) => (
            <article key={feature.title} className="feature-card" data-tone={feature.tone}>
              <div className="feature-card-top">
                <span className="feature-icon">
                  <Icon name={feature.icon} size={27} />
                </span>
                <span className="feature-index">0{i + 1}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <span className="feature-detail">{feature.detail}</span>
            </article>
          ))}
        </div>
        <aside className="feature-discovery" aria-labelledby="discovery-h">
          <div className="feature-count">
            <strong>
              40<span>+</span>
            </strong>
            <span>
              features for suppliers
              <br />
              and restaurants
            </span>
          </div>
          <div className="discovery-copy">
            <h3 id="discovery-h">You’ve only seen the beginning.</h3>
            <p>
              From promoting your goods to running your daily operations, there’s more to discover.
              Request a personal demo for the full experience—and a few surprises along the way.
            </p>
            <small>Feature availability depends on your business and setup.</small>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openDemo('feature-discovery')}
          >
            Request a personal demo <Icon name="arrow" size={17} />
          </button>
        </aside>
        <a className="features-link" href="#world">
          See how it comes together <Icon name="arrow" size={18} />
        </a>
      </div>
    </section>
  )
}
