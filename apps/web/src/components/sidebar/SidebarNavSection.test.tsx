import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Package } from 'lucide-react'
import { SidebarNavSection } from './SidebarNavSection'

afterEach(cleanup)

describe('sidebar task groups', () => {
  it('allows collapsing a group and reopens it when navigating to its page', () => {
    const section = {
      label: 'Purchasing',
      items: [{ name: 'Products', href: '/app/products', icon: Package }],
    }
    const badges = {
      pendingOrders: 0,
      unreadCount: 0,
      activeDisputeCount: 0,
      orderUsageBadge: null,
      showOrderUsageOnCart: false,
    }
    const view = (pathname: string) => (
      <MemoryRouter>
        <SidebarNavSection section={section} pathname={pathname} badges={badges} />
      </MemoryRouter>
    )
    const { rerender } = render(view('/app/orders'))
    fireEvent.click(screen.getByRole('button', { name: 'Purchasing' }))
    expect(screen.queryByRole('link', { name: 'Products' })).toBeNull()
    rerender(view('/app/products'))
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Purchasing' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })
})
