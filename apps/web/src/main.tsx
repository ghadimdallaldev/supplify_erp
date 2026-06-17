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
  perfLog('app.bootstrap.load', { durationMs: Math.round(performance.now() - appLoadT0) })
})
