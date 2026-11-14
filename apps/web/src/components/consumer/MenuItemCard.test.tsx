import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { MenuItemCard } from './MenuItemCard'
import type { ConsumerMenuItem } from '../../services/consumerApi'

const item: ConsumerMenuItem = {
  id: 'dish-qa',
  name: 'Hummus & Warm Bread',
  base_price: 12,
  is_available: true,
  image_url: 'https://example.test/dish.jpg',
}
afterEach(cleanup)

describe('guest menu cards', () => {
  it('replaces a broken image and tries a changed image URL', () => {
    const { container, rerender } = renderWithProviders(
      <MenuItemCard item={item} onSelect={vi.fn()} />
    )
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('H', { exact: true })).toBeInTheDocument()
    rerender(
      <MenuItemCard
        item={{ ...item, image_url: 'https://example.test/new.jpg' }}
        onSelect={vi.fn()}
      />
    )
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/new.jpg')
  })

  it('keeps the featured card action in preorder mode and opens the selected dish', async () => {
    const onSelect = vi.fn()
    renderWithProviders(
      <MenuItemCard item={item} onSelect={onSelect} featured orderingMode="PREORDER_ONLY" />
    )
    expect(screen.getByText('Preorder', { exact: true })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: `Add ${item.name}`, exact: true }))
    expect(onSelect).toHaveBeenCalledWith(item)
  })

  it('disables both featured actions when ordering is closed', () => {
    renderWithProviders(
      <MenuItemCard item={item} onSelect={vi.fn()} featured orderingMode="CLOSED" />
    )
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })
})
