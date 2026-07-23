import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { Toaster } from './components/ui/sonner.tsx'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { store } from './store/index.ts'
import './index.css'
import 'sonner/dist/styles.css'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { assertHostedWebConfig } from './lib/env'
import { perfLog } from './lib/perfLog'
import './i18n/index.ts'

assertHostedWebConfig()
registerServiceWorker()

const PRELOAD_RELOAD_KEY = 'vite-preload-reload'

/**
 * After a deploy, hashed lazy chunks from the previous build 404. Reload once
 * so the browser picks up the new index.html + asset map (Vite version skew).
 * @see https://vite.dev/guide/build.html#load-error-handling
 */
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  try {
    if (sessionStorage.getItem(PRELOAD_RELOAD_KEY) === '1') return
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1')
  } catch {
    // sessionStorage may be unavailable; still attempt a single reload
  }
  window.location.reload()
})

const appLoadT0 = performance.now()
perfLog('app.bootstrap.start')

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster />
      </Provider>
    </QueryClientProvider>
  </React.StrictMode>
)

window.addEventListener('load', () => {
  try {
    sessionStorage.removeItem(PRELOAD_RELOAD_KEY)
  } catch {
    // ignore
  }
  perfLog('app.bootstrap.load', { durationMs: Math.round(performance.now() - appLoadT0) })
})
