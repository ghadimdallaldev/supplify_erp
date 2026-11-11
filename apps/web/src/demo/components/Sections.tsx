'use client'
import { useEffect, useRef, useState } from 'react'
import { OrderLine } from './OrderLine'
import { useSite, type Role } from './SiteProvider'
import { Icon } from './Icon'

const ECO = [
  { label: 'Restaurants', caption: 'Discover suppliers, build the order, place it.' },
  { label: 'Orders', caption: 'One order, one status, visible to both sides.' },
  { label: 'Suppliers', caption: 'Accept, check stock, keep customers close.' },
  { label: 'Warehouses', caption: 'Stock, pick lists and preparation.' },
  { label: 'Deliveries', caption: 'Driver, status and estimated arrival to the door.' },
]

export function Ecosystem() {
  return (
    <section className="eco" aria-labelledby="eco-h">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">The connected line</p>
          <h2 id="eco-h">Restaurants, suppliers, warehouses and drivers, on the same line.</h2>
          <p className="section-lede">
            Today an order travels by call, chat and paper. Here it never leaves the line.
          </p>
        </div>
        <OrderLine
          stations={ECO}
          variant="eco"
          label="Restaurants, orders, suppliers, warehouses, deliveries"
        />
      </div>
    </section>
  )
}

type Shot = { src: string; w: number; h: number; title: string; caption: string; side: Role }
const SHOTS: Shot[] = [
  {
    src: '/demo/assets/shots/supplier-priorities.webp',
    w: 1592,
    h: 806,
    title: 'Command Center',
    caption:
      "Today's priorities: orders needing action, deliveries pending, restaurants due to reorder, products low on stock.",
    side: 'supplier',
  },
  {
    src: '/demo/assets/shots/supplier-orders.webp',
    w: 1836,
    h: 419,
    title: 'Orders inbox',
    caption:
      'Every order by status, with the next action one tap away: acknowledge, start processing, ship, mark delivered.',
    side: 'supplier',
  },
  {
    src: '/demo/assets/shots/supplier-fulfillment.webp',
    w: 1556,
    h: 1131,
    title: 'Fulfillment and logistics',
    caption:
      'Pick lists, driver dispatch, routes and delivery tracking, with a live count of pending, out for delivery and delivered.',
    side: 'supplier',
  },
  {
    src: '/demo/assets/shots/supplier-inventory.webp',
    w: 1988,
    h: 842,
    title: 'Inventory',
    caption:
      'On hand, reserved and available per product, with low and out-of-stock items flagged.',
    side: 'supplier',
  },
  {
    src: '/demo/assets/shots/restaurant-orders.webp',
    w: 1620,
    h: 845,
    title: 'Orders inbox',
    caption: 'Every order the restaurant team has placed, with its status from Placed to Shipped.',
    side: 'restaurant',
  },
  {
    src: '/demo/assets/shots/restaurant-lists.webp',
    w: 1541,
    h: 816,
    title: 'Ordering lists',
    caption:
      'Saved supplier lists for fast reorders, including scheduled ones. This team chose a crimson accent in Settings.',
    side: 'restaurant',
  },
]

export function Preview() {
  const { role } = useSite()
  const [tab, setTab] = useState<Role>('supplier')
  const [touched, setTouched] = useState(false)
  const [idx, setIdx] = useState(0)
  const [zoom, setZoom] = useState(false)
  const dlg = useRef<HTMLDialogElement>(null)
  const active: Role = touched ? tab : (role ?? tab)
  const shots = SHOTS.filter((s) => s.side === active)
  const cur = shots[Math.min(idx, shots.length - 1)]

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (zoom && !d.open) d.showModal()
    if (!zoom && d.open) d.close()
  }, [zoom])

  return (
    <section className="preview" id="product" aria-labelledby="pv-h">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">The real product</p>
          <h2 id="pv-h">Real screens, sample data.</h2>
          <p className="section-lede">
            Captured from the Supplify demo environment with fictitious businesses. Each team sets
            its own accent colour and adds its own logo in Settings, so your screens can look
            different.
          </p>
          <div className="role-switch" role="group" aria-label="Product side">
            {(['supplier', 'restaurant'] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={active === r}
                onClick={() => {
                  setTouched(true)
                  setTab(r)
                  setIdx(0)
                }}
              >
                {r === 'supplier' ? 'Supplier side' : 'Restaurant side'}
              </button>
            ))}
          </div>
        </div>
        <div className="viewer">
          <ul className="viewer-tabs" aria-label="Screens">
            {shots.map((s, i) => (
              <li key={s.src}>
                <button type="button" aria-pressed={cur === s} onClick={() => setIdx(i)}>
                  <b>{s.title}</b>
                  <small>{s.caption}</small>
                </button>
              </li>
            ))}
          </ul>
          <figure className="viewer-stage">
            <div className="viewer-screen-head">
              <span>
                <Icon name="layers" size={14} /> {cur.title}
              </span>
              <span className="sample-tag">Real screen · Sample data</span>
            </div>
            <button
              type="button"
              className="shot-frame"
              onClick={() => setZoom(true)}
              aria-label={`Enlarge: ${cur.title}`}
            >
              <img
                key={cur.src}
                src={cur.src}
                width={cur.w}
                height={cur.h}
                alt={`${cur.title}: ${cur.caption}`}
                sizes="(min-width: 1328px) 956px, (min-width: 1000px) calc(100vw - 372px), (min-width: 720px) calc(100vw - 80px), calc(100vw - 42px)"
                loading="lazy"
              />
            </button>
            <figcaption>
              <b>{cur.title}.</b> {cur.caption}{' '}
              <button type="button" className="enlarge" onClick={() => setZoom(true)}>
                Enlarge screen
              </button>
            </figcaption>
          </figure>
        </div>
      </div>
      <dialog
        ref={dlg}
        className="lightbox"
        aria-label={`${cur.title}, enlarged`}
        onClose={() => setZoom(false)}
        onClick={(e) => e.target === dlg.current && setZoom(false)}
      >
        <button
          type="button"
          className="demo-close lightbox-close"
          onClick={() => setZoom(false)}
          aria-label="Close enlarged screen"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M4 4l12 12M16 4L4 16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {zoom && (
          <img src={cur.src} width={cur.w} height={cur.h} alt={`${cur.title}: ${cur.caption}`} />
        )}
        <p>
          {cur.title}. {cur.caption}
        </p>
      </dialog>
    </section>
  )
}

const WHY: Record<Role, { title: string; lead: string; points: [string, string][] }> = {
  supplier: {
    title: 'For suppliers',
    lead: 'Stay close to the restaurants you already serve.',
    points: [
      [
        'One place for orders',
        'Orders arrive organised, instead of scattered across calls, chats and paper.',
      ],
      ['Stock you can trust', 'Check and reserve stock against each order before you promise it.'],
      [
        'Your deliveries, your drivers',
        'Assign drivers and let restaurants follow the status and estimated arrival.',
      ],
      ['Know your customers', 'See which restaurants are active and which are due to reorder.'],
      ['Promotions that reach them', 'Send deals to the restaurants that follow you.'],
    ],
  },
  restaurant: {
    title: 'For restaurants',
    lead: 'Run your purchasing from one place.',
    points: [
      [
        'All your suppliers together',
        'Discover, follow and order from your suppliers without switching apps or chats.',
      ],
      [
        'Know where every order is',
        'Accepted, preparing, shipped, with an estimated arrival on its way.',
      ],
      ['Receiving that counts', 'Confirm what actually arrived, in the same system as the order.'],
      [
        'Reorder in a few taps',
        'Ordering lists, including scheduled ones, make the weekly order quick.',
      ],
      [
        'Built for teams and branches',
        'Roles for purchasers, managers and receiving staff, across locations.',
      ],
    ],
  },
}

export function Why() {
  const { role } = useSite()
  const order: Role[] =
    role === 'restaurant' ? ['restaurant', 'supplier'] : ['supplier', 'restaurant']
  return (
    <section className="why" aria-labelledby="why-h">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">Why Supplify</p>
          <h2 id="why-h">One line that both sides can see.</h2>
          <p className="section-lede">
            Each team sets its own accent colour and adds its own logo in Settings, and access is by
            role, from purchaser to receiving clerk to driver.
          </p>
        </div>
        <div className="why-grid">
          {order.map((r, i) => (
            <article key={r} className="why-col" data-lead={i === 0}>
              <h3>{WHY[r].title}</h3>
              <p className="why-lead">{WHY[r].lead}</p>
              <ul>
                {WHY[r].points.map(([t, d]) => (
                  <li key={t}>
                    <b>{t}</b>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const FAQ: [string, string][] = [
  [
    'What is Supplify?',
    'A marketplace and operating system for the restaurant supply chain. Restaurants discover suppliers, order, receive and manage stock. Suppliers manage their catalog, incoming orders, warehouses, deliveries and restaurant customers, all on one connected flow from discovery to invoice.',
  ],
  [
    'Who is it for?',
    'Restaurants, hotels, groups and their branches, and the suppliers and distributors that serve them, including warehouse and driver teams. People get access by role, so a purchaser, a receiving clerk and a manager each see what they need.',
  ],
  [
    'Do I have to change who I buy from or sell to?',
    'No. Restaurants follow the suppliers they already use and suppliers connect with the restaurants they already serve. Supplify gives that relationship one place to run.',
  ],
  [
    'How does delivery tracking work?',
    'Suppliers run their own deliveries. Drivers see only the deliveries assigned to them. Restaurants follow each order’s status and, while it is out for delivery, see an estimated arrival. It is an estimate, not turn-by-turn navigation.',
  ],
  [
    'How do suppliers get their products in?',
    'Suppliers manage their catalog directly in Supplify, can import products from a CSV file, and can bulk-import product images. Restaurants then browse that catalog, add to cart and place the order.',
  ],
  [
    'Can suppliers promote their products?',
    'Yes. Suppliers can create product deals for restaurants that follow them, use sponsored boosts to reach new restaurant customers, and track how offers perform. Promotion availability and publication are subject to your setup and review requirements.',
  ],
  [
    'Does my business have its own workspace?',
    'Yes. Each business has its own workspace, company records and team access. Linked branch accounts let you work across your business while keeping each account’s operations separate. Restaurants and suppliers share the orders and conversations that connect them.',
  ],
  [
    'How does Supplify help keep our business secure?',
    'Protected sign-in, access based on each team member’s role, and activity logs help you control access to business information and keep track of changes. Your business works in its own separate workspace.',
  ],
  [
    'Are these all the features?',
    'This is a first look at 40+ features across supplier and restaurant workflows. Request a personal demo to explore the tools that fit your business, discover more of the platform, and see a few surprises along the way. Feature availability depends on your business and setup.',
  ],
  [
    'What does it cost?',
    'It depends on your setup. Request a personal demo and the team will walk you through it.',
  ],
  [
    'What happens when I request a demo?',
    'You leave your name and WhatsApp number. Someone from the Supplify team contacts you to arrange a personal walkthrough. Nothing is booked automatically.',
  ],
  [
    'Is the walkthrough real data?',
    'No. The walkthroughs use fictitious businesses and sample prices. The screenshots come from the Supplify demo environment, also with sample data.',
  ],
]

export function Faq() {
  return (
    <section className="faq" id="questions" aria-labelledby="faq-h">
      <div className="wrap faq-grid">
        <div className="section-head">
          <p className="eyebrow">Questions</p>
          <h2 id="faq-h">Good to know.</h2>
          <p className="section-lede">A few things before we get you on the line.</p>
          <a className="faq-link" href="#world">
            Take a look around <Icon name="arrow" size={18} />
          </a>
        </div>
        <div className="faq-list">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  const { openDemo } = useSite()
  return (
    <section className="final" aria-labelledby="final-h">
      <div className="wrap">
        <p className="eyebrow">
          <span className="connection-dot" /> Let’s connect at HORECA Beirut 2026
        </p>
        <h2 id="final-h">
          Your next order.
          <br />
          <em>A better way.</em>
        </h2>
        <p className="final-lede">
          40+ features for suppliers and restaurants. Discover what fits your business—and a few
          surprises we’ll save for your personal demo.
        </p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => openDemo('final')}>
          Request a personal demo <Icon name="arrow" size={20} />
        </button>
        <p className="final-note">
          Leave your WhatsApp number and the Supplify team will be in touch. No commitment.
        </p>
      </div>
    </section>
  )
}
