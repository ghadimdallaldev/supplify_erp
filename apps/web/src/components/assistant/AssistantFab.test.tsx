import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { AssistantFab } from './AssistantFab'

vi.mock('../../i18n', () => ({
  ensureNamespace: vi.fn(async () => undefined),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('../../hooks/useImpersonation', () => ({
  useImpersonation: () => ({ isImpersonating: false }),
}))

vi.mock('../../services/api', () => ({
  useGetEntitlementsQuery: () => ({
    data: { features: { ai_platform: true } },
  }),
  useGetAssistantCapabilitiesQuery: () => ({
    data: { enabled: true, tools: ['get_inventory'], quotaRemaining: 5 },
    isFetching: false,
  }),
  useGetAssistantMessagesQuery: () => ({ data: { messages: [] } }),
  useSendAssistantMessageMutation: () => [vi.fn(), { isLoading: false }],
}))

vi.mock('../../lib/planLimits', () => ({
  featureEnabled: () => true,
}))

function renderWithAuth(role = 'RESTAURANT') {
  const store = configureStore({
    reducer: {
      auth: () => ({ user: { id: 'u1', role } }),
    },
  })
  return render(
    <Provider store={store}>
      <AssistantFab />
    </Provider>
  )
}

describe('AssistantFab', () => {
  it('renders FAB when ai_platform is enabled', () => {
    renderWithAuth()
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument()
  })
})
