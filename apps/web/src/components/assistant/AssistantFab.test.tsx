import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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
let savedMessages: unknown[] = []
const sendMessage = vi.fn()

vi.mock('../../services/api', () => ({
  useGetEntitlementsQuery: () => ({ data: entitlementsPayload }),
  useGetAssistantCapabilitiesQuery: () => ({
    data: { enabled: true, tools: ['get_inventory'], quotaRemaining: 5 },
    isFetching: false,
  }),
  useGetAssistantMessagesQuery: () => ({ currentData: { messages: savedMessages } }),
  useGetAssistantConversationsQuery: () => ({
    data: { conversations: [{ id: 'conv1', title: 'Earlier conversation' }] },
  }),
  useGetPresignedUrlMutation: () => [vi.fn()],
  useSendAssistantMessageMutation: () => [sendMessage, { isLoading: false }],
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
      <MemoryRouter>
        <AssistantFab />
      </MemoryRouter>
    </Provider>
  )
}

describe('AssistantFab', () => {
  beforeEach(() => {
    cleanup()
    savedMessages = []
    sendMessage.mockReset()
    Element.prototype.scrollIntoView = vi.fn()
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

  it('restores a saved conversation and clearly labels failed and limited sources', async () => {
    savedMessages = [
      {
        id: 'm1',
        role: 'assistant',
        content: 'A limited result',
        toolPayload: {
          sources: [
            {
              tool: 'get_inventory',
              ok: true,
              evidence: {
                href: '/app/restaurant-inventory',
                fetchedAt: '2026-11-14T12:00:00Z',
                limited: true,
              },
            },
            { tool: 'get_invoices', ok: false },
          ],
        },
      },
    ]
    renderWithAuth()
    await userEvent.click(screen.getByTestId('assistant-fab'))
    await userEvent.click(screen.getByRole('button', { name: 'history' }))
    await userEvent.click(screen.getByRole('button', { name: 'Earlier conversation' }))
    expect(screen.getByText('A limited result')).toBeInTheDocument()
    expect(screen.getByText('limitedResults')).toBeInTheDocument()
    expect(screen.getByText(/sourceUnavailable/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'sources.get_inventory' })).toHaveAttribute(
      'href',
      '/app/restaurant-inventory'
    )
  })

  it('keeps the draft available when a send fails', async () => {
    sendMessage.mockReturnValue({ unwrap: () => Promise.reject(new Error('network')) })
    renderWithAuth()
    await userEvent.click(screen.getByTestId('assistant-fab'))
    await userEvent.type(screen.getByTestId('assistant-input'), 'What needs attention?')
    await userEvent.click(screen.getByTestId('assistant-send'))
    expect(await screen.findByText('error')).toBeInTheDocument()
    expect(screen.getByTestId('assistant-input')).toHaveValue('What needs attention?')
  })
})
