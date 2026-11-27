import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { FollowRequiredPanel } from './FollowRequiredPanel'

const followFn = vi.fn()

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useFollowSupplierMutation: () => [followFn, { isLoading: false }],
    useUnblockSupplierMutation: () => [vi.fn(), { isLoading: false }],
  }
})

vi.mock('../../lib/openBrowseUpgrade', () => ({ openBrowseUpgrade: vi.fn() }))

describe('FollowRequiredPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    followFn.mockImplementation(() => ({ unwrap: () => Promise.resolve({}) }))
  })

  it('cart FOLLOW_REQUIRED shows per-supplier follow rows', async () => {
    const onFollowed = vi.fn()
    renderWithProviders(
      <FollowRequiredPanel
        suppliers={[
          { id: 'sup-1', name: 'Fresh Farms' },
          { id: 'sup-2', name: 'Olive Co' },
        ]}
        onFollowed={onFollowed}
      />
    )

    const rows = screen.getAllByTestId(/^follow-required-row-/)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Fresh Farms')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Olive Co')).toBeInTheDocument()

    await userEvent.click(within(rows[1]).getByRole('button', { name: /follow & keep in cart/i }))

    await waitFor(() => expect(onFollowed).toHaveBeenCalledWith('sup-2'))
    expect(followFn).toHaveBeenCalledWith('sup-2')
  })

  it('renders nothing when no supplier needs a follow', () => {
    const { container } = renderWithProviders(
      <FollowRequiredPanel suppliers={[]} onFollowed={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
