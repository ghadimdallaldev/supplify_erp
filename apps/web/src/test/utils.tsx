import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { ROUTER_FUTURE } from '../lib/routerFuture'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { store } from '../store'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={ROUTER_FUTURE}>{children}</BrowserRouter>
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
