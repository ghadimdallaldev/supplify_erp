import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { ReservationBoard } from './ReservationBoard'
import type { Reservation, ReservationTable } from '../../types'
const assign = vi.fn(),
  update = vi.fn()
vi.mock('../../services/reservationsApi', () => ({
  useAssignReservationTablesMutation: () => [assign, { isLoading: false }],
  useUpdateReservationStatusMutation: () => [update, { isLoading: false }],
}))
const reservation = {
  id: 'r1',
  status: 'CONFIRMED',
  customer_name: 'QA Guest',
  party_size: 4,
  scheduled_at: '2099-01-01T18:00:00Z',
  tables: ['t1'],
} as Reservation
const tables = [{ id: 't1', name: 'Terrace', capacity: 4, is_active: true }] as ReservationTable[]
const props = {
  reservations: [reservation],
  tables,
  waitlist: [],
  boardDate: '2099-01-01',
  branchId: 'b1',
}
beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  assign.mockReturnValue({ unwrap: () => Promise.resolve({}) })
  update.mockReturnValue({ unwrap: () => Promise.resolve({}) })
})
describe('reservation board controls', () => {
  it('assigns the selected table with the current date and branch, and supports seating without dragging', async () => {
    renderWithProviders(<ReservationBoard {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /assign table/i }))
    expect(assign).toHaveBeenCalledWith({
      id: 'r1',
      tableIds: ['t1'],
      boardDate: '2099-01-01',
      branchId: 'b1',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Seat' }))
    expect(update).toHaveBeenCalledWith({ id: 'r1', status: 'SEATED' })
  })
  it('clears a stale table choice when the assignment is removed elsewhere', async () => {
    const view = renderWithProviders(<ReservationBoard {...props} />)
    expect(screen.getByRole('combobox')).toHaveValue('t1')
    view.rerender(<ReservationBoard {...props} reservations={[{ ...reservation, tables: [] }]} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue(''))
    expect(screen.getByRole('button', { name: /assign table/i })).toBeDisabled()
  })
  it('does not show mutation controls to a read-only host', () => {
    renderWithProviders(<ReservationBoard {...props} readOnly />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seat' })).not.toBeInTheDocument()
  })
})
