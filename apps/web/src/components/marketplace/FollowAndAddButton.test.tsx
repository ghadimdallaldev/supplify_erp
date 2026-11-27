import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { testI18n } from '../../test/i18n'
import { FollowAndAddButton } from './FollowAndAddButton'
import type { Product } from '../../types'

const followFn = vi.fn()
const unblockFn = vi.fn()
const openBrowseUpgrade = vi.fn()
const toastError = vi.fn()

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return {
    ...actual,
    useFollowSupplierMutation: () => [followFn, { isLoading: false }],
    useUnblockSupplierMutation: () => [unblockFn, { isLoading: false }],
  }
})

vi.mock('../../lib/openBrowseUpgrade', () => ({
  openBrowseUpgrade: (...args: unknown[]) => openBrowseUpgrade(...args),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  }),
}))

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  supplier_id: 'sup-1',
  supplier_name: 'Fresh Farms',
  sku: 'TOM-1',
  name: 'Tomatoes',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  available_qty: 10,
  is_followed: false,
  can_order: false,
  ...over,
})

const ok = () => ({ unwrap: () => Promise.resolve({}) })
const fail = (name: string) => ({
  unwrap: () => Promise.reject({ status: 403, data: { error: { name, message: name } } }),
})

describe('FollowAndAddButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    followFn.mockImplementation(ok)
  })
  afterEach(async () => {
    await testI18n.changeLanguage('en')
  })

  it('Follow & add follows then adds in one tap', async () => {
    const onAdd = vi.fn()
    renderWithProviders(<FollowAndAddButton product={product()} onAdd={onAdd} />)

    await userEvent.click(screen.getByRole('button', { name: /follow & add/i }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(followFn).toHaveBeenCalledWith('sup-1')
    expect(onAdd.mock.calls[0][0]).toMatchObject({ id: 'p1', is_followed: true, can_order: true })
  })

  it('adds directly without following when the supplier is already followed', async () => {
    const onAdd = vi.fn()
    renderWithProviders(
      <FollowAndAddButton product={product({ is_followed: true, can_order: true })} onAdd={onAdd} />
    )

    await userEvent.click(screen.getByRole('button', { name: /add to cart/i }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(followFn).not.toHaveBeenCalled()
  })

  it('follow at cap opens upgrade prompt', async () => {
    followFn.mockImplementation(() => fail('SUPPLIER_FOLLOW_LIMIT_REACHED'))
    const onAdd = vi.fn()
    renderWithProviders(<FollowAndAddButton product={product()} onAdd={onAdd} />)

    await userEvent.click(screen.getByRole('button', { name: /follow & add/i }))

    await waitFor(() => expect(openBrowseUpgrade).toHaveBeenCalledTimes(1))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('blocked supplier asks to unblock instead of adding', async () => {
    followFn.mockImplementation(() => fail('SUPPLIER_BLOCKED'))
    const onAdd = vi.fn()
    renderWithProviders(<FollowAndAddButton product={product()} onAdd={onAdd} />)

    await userEvent.click(screen.getByRole('button', { name: /follow & add/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(String(toastError.mock.calls[0][0])).toMatch(/unblock/i)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('renders right-to-left in Arabic', async () => {
    await testI18n.changeLanguage('ar')
    const { container } = renderWithProviders(
      <div dir="rtl">
        <FollowAndAddButton product={product()} onAdd={vi.fn()} />
      </div>
    )
    const button = screen.getByRole('button')
    expect(button.textContent).not.toMatch(/follow/i)
    expect(container.firstChild).toMatchSnapshot()
  })
})
