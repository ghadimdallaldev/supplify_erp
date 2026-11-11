'use client'
import { useState } from 'react'
import { useSite } from './SiteProvider'
import { RestaurantSim } from './sim/RestaurantSim'
import { SupplierSim } from './sim/SupplierSim'
import { Icon } from './Icon'

const ACCENTS = [
  { id: 'violet', name: 'Violet', value: '#5B21B6' },
  { id: 'crimson', name: 'Crimson', value: '#B4143C' },
  { id: 'blue', name: 'Blue', value: '#1D4ED8' },
  { id: 'teal', name: 'Teal', value: '#0E7490' },
]

export function Experience() {
  const { role, setRole, track } = useSite()
  const [accent, setAccent] = useState(ACCENTS[0])
  const [logo, setLogo] = useState(false)
  if (!role) return null
  const supplier = role === 'supplier'
  return (
    <section
      className="experience"
      id="experience"
      aria-labelledby="exp-h"
      style={{ ['--accent' as string]: accent.value }}
      data-accent={accent.id}
    >
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">
            <span className="section-number">03</span> Interactive walkthrough · 7 steps
          </p>
          <h2 id="exp-h">
            {supplier ? (
              <>
                An order arrives.
                <br />
                <em>You’re in control.</em>
              </>
            ) : (
              <>
                From your first order.
                <br />
                <em>To your next one.</em>
              </>
            )}
          </h2>
          <p className="section-lede">
            {supplier
              ? 'Tap through a real order lifecycle: it arrives, you accept, check stock, prepare, send a driver and see who is ordering. Sample businesses, sample data.'
              : 'Tap through a real order lifecycle: find a supplier, build an order, place it, follow it to the door, receive it and reorder. Sample businesses, sample data.'}
          </p>
          <div className="role-switch" role="group" aria-label="Switch walkthrough">
            <button
              type="button"
              aria-pressed={supplier}
              onClick={() => {
                setRole('supplier')
                track('role_selected', 'supplier', 'supplier')
              }}
            >
              Supplier
            </button>
            <button
              type="button"
              aria-pressed={!supplier}
              onClick={() => {
                setRole('restaurant')
                track('role_selected', 'restaurant', 'restaurant')
              }}
            >
              Restaurant
            </button>
          </div>
        </div>
        <div className="appbar" aria-hidden="true">
          <span className="appbar-brand">
            <img src="/demo/assets/logo-mark.webp" width="22" height="20" alt="" />
            Supplify
          </span>
          <span className="appbar-sep" />
          {logo ? (
            <span className="appbar-logo" key={supplier ? 's' : 'r'}>
              <svg width="24" height="24" viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="var(--accent)" />
                <path
                  d={
                    supplier
                      ? 'M12 5v14M12 8c-3-1-5 0-6 2m6-2c3-1 5 0 6 2m-6 3c-3-1-5 0-6 2m6-2c3-1 5 0 6 2'
                      : 'M7 6v12M17 6v12M7 12h10'
                  }
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              {supplier ? 'Cedar Fresh Produce' : 'Hamra Bistro'}
            </span>
          ) : (
            <span className="appbar-empty">
              {supplier ? 'Cedar Fresh Produce' : 'Hamra Bistro'}
            </span>
          )}
          <span className="appbar-demo">
            <span className="connection-dot" /> Interactive demo
          </span>
        </div>
        {supplier ? <SupplierSim key="s" /> : <RestaurantSim key="r" />}
        <div className="accent-row">
          <p>
            <Icon name="layers" size={20} />
            <span>
              <b>Make it yours.</b> Try your colours and a sample logo.
            </span>
          </p>
          <div className="accent-controls">
            <div
              className="swatches"
              role="radiogroup"
              aria-label="Accent colour"
              onKeyDown={(e) => {
                if (
                  !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                    e.key
                  )
                )
                  return
                e.preventDefault()
                const i = ACCENTS.findIndex((a) => a.id === accent.id)
                const next =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? ACCENTS.length - 1
                      : (i +
                          (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) +
                          ACCENTS.length) %
                        ACCENTS.length
                setAccent(ACCENTS[next])
                e.currentTarget.querySelectorAll<HTMLButtonElement>('.swatch')[next]?.focus()
              }}
            >
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={accent.id === a.id}
                  aria-label={a.name}
                  tabIndex={accent.id === a.id ? 0 : -1}
                  className="swatch"
                  style={{ ['--swatch' as string]: a.value }}
                  onClick={() => setAccent(a)}
                >
                  <Icon name="check" size={15} />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-small btn-quiet logo-toggle"
              aria-pressed={logo}
              onClick={() => setLogo((l) => !l)}
            >
              {logo ? 'Remove sample logo' : 'Add a sample logo'}
            </button>
          </div>
        </div>
        <p className="experience-disclaimer">
          This is a guided experience with sample businesses and data. Your team’s workspace can be
          customised in Settings.
        </p>
      </div>
    </section>
  )
}
