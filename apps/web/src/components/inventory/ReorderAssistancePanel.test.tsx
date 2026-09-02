import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { ReorderAssistancePanel } from './ReorderAssistancePanel'
import { testI18n, resetTestI18n } from '../../test/i18n'

const mockAiRecommend = vi.fn()
const mockFeedback = vi.fn()
const mockAddItem = vi.fn()
const mockSuppress = vi.fn()
let mockEntitlements: any = {
  limits: { ai_requests_per_day: 20 },
  usage: { ai_requests_per_day: 1 },
}

vi.mock('../../services/api', () => ({
  useGetReorderAssistanceQuery: () => ({
    data: {
      suggestions: [
        {
          id: 'stock-p1',
          productId: 'p1',
          productName: 'Tomatoes',
          productUnit: 'kg',
          supplierId: 's1',
          supplierName: 'Fresh Co',
          reasonCode: 'low_stock',
          reasonLabel: 'Low stock',
          urgency: 'HIGH',
          suggestedQty: 10,
          scopeType: 'product',
          scopeId: 'p1',
        },
      ],
      total: 1,
      smartReorder: { tier: 'gold', capabilities: { forecast: true } },
      ai: {
        envEnabled: true,
        platformEnabled: true,
        canExplainLlm: true,
        canAskLlm: false,
      },
      forecasts: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGetEntitlementsQuery: () => ({
    data: { entitlements: mockEntitlements },
  }),
  useGetQuickListsQuery: () => ({ data: { quickLists: [{ id: 'ql1', name: 'Weekly' }] } }),
  useSuppressReorderSuggestionMutation: () => [mockSuppress, { isLoading: false }],
  useAddItemToQuickListMutation: () => [mockAddItem],
  useExplainReorderAssistanceMutation: () => [vi.fn(), { isLoading: false }],
  useAskReorderAssistanceMutation: () => [vi.fn(), { isLoading: false }],
  useAiRecommendReorderAssistanceMutation: () => [mockAiRecommend, { isLoading: false }],
  useFeedbackReorderAssistanceMutation: () => [mockFeedback],
}))

function renderPanel() {
  return render(
    <MemoryRouter>
      <I18nextProvider i18n={testI18n}>
        <ReorderAssistancePanel />
      </I18nextProvider>
    </MemoryRouter>
  )
}

describe('ReorderAssistancePanel AI vs forecast labels', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await resetTestI18n()
    mockEntitlements = { limits: { ai_requests_per_day: 20 }, usage: { ai_requests_per_day: 1 } }
    mockAiRecommend.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          recommendations: [
            {
              productId: 'p1',
              source: 'ai',
              action: 'order',
              recommendedQuantity: 12,
              supplierId: 's1',
              supplierName: 'Fresh Co',
              priority: 'HIGH',
              confidence: 0.85,
              summary: 'Order tomatoes before weekend service',
              reasoning: ['Usage trending up', 'Below reorder point'],
              warnings: ['Watch lead time'],
              alternatives: [{ recommendedQuantity: 10, rationale: 'Slightly lower qty' }],
              aiMetadata: { usedLlm: true },
            },
          ],
          usedLlm: true,
        }),
    })
    mockAddItem.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    mockFeedback.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    mockSuppress.mockReturnValue({ unwrap: () => Promise.resolve({}) })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows AI Reorder Recommendation label, summary, reasoning, and warnings', async () => {
    renderPanel()

    await waitFor(() => {
      expect(screen.getByTestId('recommendation-source-label')).toHaveTextContent(
        'AI Reorder Recommendation'
      )
    })
    expect(screen.getByText('Order tomatoes before weekend service')).toBeInTheDocument()
    expect(screen.getByText('Usage trending up')).toBeInTheDocument()
    expect(screen.getByText('Watch lead time')).toBeInTheDocument()
    expect(screen.queryByText('AI Reorder Recommendation')).toBeInTheDocument()
  })

  it('uses validated AI qty for List add', async () => {
    const user = userEvent.setup()
    renderPanel()

    await waitFor(() => {
      expect(screen.getByTestId('recommendation-source-label')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /list/i }))

    await waitFor(() => {
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ productId: 'p1', quantity: 12 }),
        })
      )
    })
  })

  it('shows Forecast Reorder Recommendation when source is forecast', async () => {
    mockAiRecommend.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          recommendations: [
            {
              productId: 'p1',
              source: 'forecast',
              action: 'order',
              recommendedQuantity: 10,
              priority: 'HIGH',
              confidence: 0.5,
              summary: 'Forecast baseline',
              reasoning: ['Based on deterministic forecast / stock heuristics'],
              warnings: [],
              aiMetadata: { usedLlm: false, fallbackReason: 'ai_disabled' },
            },
          ],
          usedLlm: false,
        }),
    })

    renderPanel()

    await waitFor(() => {
      expect(screen.getByTestId('recommendation-source-label')).toHaveTextContent(
        'Forecast Reorder Recommendation'
      )
    })
    expect(screen.queryByText('AI Reorder Recommendation')).not.toBeInTheDocument()
  })

  it('labels trial AI usage as a trial-total meter', async () => {
    mockEntitlements = {
      limits: { ai_requests_per_day: 30 },
      usage: { ai_requests_per_day: 0 },
      aiUsage: {
        meterType: 'ai_trial_requests_total',
        periodType: 'trial_total',
        current: 1,
        limit: 50,
        remaining: 49,
        resetAt: '2026-08-14T00:00:00.000Z',
        trialPool: true,
      },
    }

    renderPanel()

    expect(await screen.findByText(/1\/50 AI assists this trial/)).toBeInTheDocument()
  })

  it('hides estimated cost when backend omits it', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByTestId('recommendation-source-label')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Est\. cost/i)).not.toBeInTheDocument()
  })
})
