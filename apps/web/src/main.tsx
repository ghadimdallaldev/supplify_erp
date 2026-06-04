import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { store } from './store/index.ts'
import './index.css'
import { registerServiceWorker } from './lib/registerServiceWorker'
import { assertHostedWebConfig } from './lib/env'

assertHostedWebConfig()
registerServiceWorker()

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster
          position="top-center"
          containerClassName="!top-[max(0.75rem,env(safe-area-inset-top))] sm:!top-4"
          toastOptions={{
            duration: 4000,
            className: 'text-sm',
            style: {
              maxWidth: 'min(420px, calc(100vw - 1.5rem))',
              borderRadius: '0.75rem',
              border: '1px solid var(--app-border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            },
          }}
        />
      </Provider>
    </QueryClientProvider>
  </React.StrictMode>
)
