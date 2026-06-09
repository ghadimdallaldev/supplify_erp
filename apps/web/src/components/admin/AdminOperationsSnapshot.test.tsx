import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminOperationsSnapshot } from './AdminOperationsSnapshot'
import type { AdminOverview } from '../../lib/adminOverview'

describe('AdminOperationsSnapshot', () => {
  it('renders tenants over limit when present', () => {
    const overview: AdminOverview = {
      tenantsOverLimit: 9,
      tenantsNearLimit: 7,
      orders: { today: 1, week: 2, month: 3 },
    }
    render(<AdminOperationsSnapshot overview={overview} />)
    expect(screen.getByText('Tenants over limit')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText('7 near limit')).toBeInTheDocument()
  })

  it('shows Not available when tenantsOverLimit is missing', () => {
    render(<AdminOperationsSnapshot overview={{ orders: { today: 0 } }} />)
    expect(screen.getByText('Not available')).toBeInTheDocument()
  })
})
