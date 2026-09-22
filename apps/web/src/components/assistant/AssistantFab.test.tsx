import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

/**
 * Entitlements payload the mocked query returns. Shaped exactly like the real
 * endpoint: `{ entitlements: { features } }`.
 */
let entitlementsPayload: unknown = { entitlements: { features: { ai_assistant: true } } }

vi.mock('../../services/api', () => ({
  useGetEntitlementsQuery: () => ({ data: entitlementsPayload }),
  useGetAssistantCapabilitiesQuery: () => ({
    data: { enabled: true, tools: ['get_inventory'], quotaRemaining: 5 },
    isFetching: false,
  }),
  useGetAssistantMessagesQuery: () => ({ data: { messages: [] } }),
  useSendAssistantMessageMutation: () => [vi.fn(), { isLoading: false }],
}))

// planLimits is deliberately NOT mocked. Stubbing featureEnabled to always
// return true is what hid a gate that never passed in production.

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
  beforeEach(() => {
    cleanup()
    entitlementsPayload = { entitlements: { features: { ai_assistant: true } } }
  })

  it('renders FAB when ai_assistant is enabled', () => {
    renderWithAuth()
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument()
  })

  it('reads the entitlement from the real payload shape', () => {
    // Regression: the gate read `data.features` while the endpoint returns
    // `data.entitlements.features`, so it was false for every non-admin user
    // and the assistant entry point never rendered.
    entitlementsPayload = { features: { ai_assistant: true } }
    renderWithAuth()
    expect(screen.queryByTestId('assistant-fab')).not.toBeInTheDocument()
  })

  it('hides the FAB when the plan does not include the assistant', () => {
    entitlementsPayload = { entitlements: { features: { ai_assistant: false } } }
    renderWithAuth()
    expect(screen.queryByTestId('assistant-fab')).not.toBeInTheDocument()
  })

  it('does not infer the assistant from ai_platform', () => {
    // ai_platform only covers Smart Reorder LLM assistance.
    entitlementsPayload = {
      entitlements: { features: { ai_platform: true, ai_assistant: false } },
    }
    renderWithAuth()
    expect(screen.queryByTestId('assistant-fab')).not.toBeInTheDocument()
  })

  it('does not let raw planFeatures re-enable a disabled assistant', () => {
    entitlementsPayload = {
      entitlements: {
        features: { ai_assistant: false },
        planFeatures: { ai_assistant: true },
      },
    }
    renderWithAuth()
    expect(screen.queryByTestId('assistant-fab')).not.toBeInTheDocument()
  })

  it('always shows the FAB for a platform admin who is not impersonating', () => {
    entitlementsPayload = undefined
    renderWithAuth('ADMIN')
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument()
  })
})
