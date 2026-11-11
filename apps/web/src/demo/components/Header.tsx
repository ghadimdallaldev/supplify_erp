'use client'
import { useState } from 'react'
import { useSite } from './SiteProvider'
import { Icon } from './Icon'

const LINKS = [
  { href: '#world', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#product', label: 'Product tour' },
  { href: '#questions', label: 'FAQ' },
]

export function Header() {
  const { openDemo } = useSite()
  const [menu, setMenu] = useState(false)
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <a className="brand" href="#top" onClick={() => setMenu(false)} aria-label="Supplify home">
          <img
            src="/demo/assets/logo-mark.webp"
            width={36}
            height={36}
            alt=""
            fetchPriority="high"
          />
          <span className="brand-name">
            Supplify<span className="brand-period">.</span>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <span className="header-event">
            HORECA ’26 <span>Beirut</span>
          </span>
          <button
            type="button"
            className="btn btn-primary btn-nav"
            onClick={() => {
              setMenu(false)
              openDemo('header')
            }}
          >
            <span className="long">Request a personal demo</span>
            <span className="short">Request a demo</span>
            <Icon name="arrow" size={16} />
          </button>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menu}
            aria-controls="mobile-nav"
            aria-label={menu ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMenu((m) => !m)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
      <nav
        id="mobile-nav"
        className="mobile-nav"
        aria-label="Mobile navigation"
        hidden={!menu}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setMenu(false)
            document.querySelector<HTMLButtonElement>('.menu-toggle')?.focus()
          }
        }}
      >
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setMenu(false)}>
            {l.label}
            <Icon name="arrow" size={18} />
          </a>
        ))}
      </nav>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-main">
          <a className="brand" href="#top">
            <img src="/demo/assets/logo-mark.webp" width={32} height={32} alt="" />
            <span className="brand-name">Supplify.</span>
          </a>
          <p>Every order, one line.</p>
          <a href="#top">
            Back to top <span aria-hidden="true">↑</span>
          </a>
        </div>
        <div className="foot-in">
          <p>
            Walkthroughs use fictitious businesses and sample data. Screenshots are from the
            Supplify demo environment. Your details are used only to follow up on your demo request.
          </p>
          <span className="eyebrow">HORECA Beirut 2026</span>
        </div>
      </div>
    </footer>
  )
}
