import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SupplierBusinessTab } from './SupplierBusinessTab'

const controls = vi.hoisted(() => ({
  update: vi.fn(() => ({ unwrap: async () => ({}) })),
  data: {
    business: {
      operatingHours: Object.fromEntries(
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
          (day) => [day, { open: '09:00', close: '17:00', closed: false }]
        )
      ),
      minimumOrderAmount: 50,
      paymentTerms: 'Net 30',
      returnPolicy: '',
      termsAndConditions: '',
      lastOrderMode: 'cutoff',
      lastOrderTimezone: 'UTC',
    },
  },
}))
vi.mock('../../../../services/api', () => ({
  useGetSupplierBusinessSettingsQuery: () => ({ data: controls.data }),
  useUpdateSupplierBusinessSettingsMutation: () => [controls.update, { isLoading: false }],
}))
vi.mock('../../../../i18n', () => ({ ensureNamespace: vi.fn(async () => {}) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('SupplierBusinessTab cutoff timezone', () => {
  it('loads and saves the selected timezone with the existing cutoff settings', async () => {
    render(<SupplierBusinessTab />)
    const timezone = screen.getByLabelText('Timezone')
    expect(timezone).toHaveValue('UTC')
    fireEvent.change(timezone, { target: { value: 'Asia/Tokyo' } })
    fireEvent.click(screen.getByRole('button', { name: 'business.save' }))
    await waitFor(() =>
      expect(controls.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastOrderTimezone: 'Asia/Tokyo',
          lastOrderMode: 'cutoff',
          minimumOrderAmount: 50,
        })
      )
    )
  })
})
