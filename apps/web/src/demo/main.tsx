import React, { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import Demo from './Demo'
import './styles/globals.css'
import './styles/experience.css'

const Admin = lazy(() => import('./Admin'))
const isAdmin = /^\/demo\/admin\/?$/.test(window.location.pathname)
if (isAdmin) {
  document.title = 'Campaign admin · Supplify'
  const robots = document.createElement('meta')
  robots.name = 'robots'
  robots.content = 'noindex, nofollow'
  document.head.append(robots)
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? (
      <Suspense fallback={<main className="admin">Loading campaign…</main>}>
        <Admin />
      </Suspense>
    ) : (
      <Demo />
    )}
  </React.StrictMode>
)
