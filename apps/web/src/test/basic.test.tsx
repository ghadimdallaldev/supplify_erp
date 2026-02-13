import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from '../App'
import { store } from '../store'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('Web App Tests', () => {
  it('should render without crashing', () => {
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </Provider>
    )
    expect(document.body.querySelector('.min-h-screen')).toBeInTheDocument()
  })
})
