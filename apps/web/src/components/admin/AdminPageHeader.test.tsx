import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminPageHeader } from './AdminPageHeader'
import { getAdminPageHeader } from '../../lib/adminPageHeaders'

describe('AdminPageHeader', () => {
  it('renders Platform Command Center header', () => {
    const { title, subtitle } = getAdminPageHeader('platform')
    render(<AdminPageHeader title={title} subtitle={subtitle} />)
    expect(screen.getByText('Platform Command Center')).toBeInTheDocument()
    expect(
      screen.getByText(/Monitor tenants, subscriptions, usage, operations, and system health/)
    ).toBeInTheDocument()
  })
})
