import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { ROUTER_FUTURE } from '../lib/routerFuture'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { store } from '../store'
import { testI18n } from './i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={testI18n}>
          <BrowserRouter future={ROUTER_FUTURE}>{children}</BrowserRouter>
        </I18nextProvider>
      </QueryClientProvider>
    </Provider>
  )
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: AllTheProviders,
    ...options,
  })
}
