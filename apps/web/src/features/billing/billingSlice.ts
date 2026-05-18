import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type PaymentModalMode = 'checkout' | 'pay_overdue'

export interface PaymentModalPlan {
  planId: string
  planCode: string
  planName: string
  priceMonthly: number
  priceYearly: number | null
}

interface BillingState {
  paymentModalOpen: boolean
  paymentModalMode: PaymentModalMode
  paymentModalPlan: PaymentModalPlan | null
}

const initialState: BillingState = {
  paymentModalOpen: false,
  paymentModalMode: 'checkout',
  paymentModalPlan: null,
}

const billingSlice = createSlice({
  name: 'billing',
  initialState,
  reducers: {
    openPaymentModal: (
      state,
      action: PayloadAction<{ mode?: PaymentModalMode; plan: PaymentModalPlan }>
    ) => {
      state.paymentModalOpen = true
      state.paymentModalMode = action.payload.mode ?? 'checkout'
      state.paymentModalPlan = action.payload.plan
    },
    openPayOverdueModal: (state) => {
      state.paymentModalOpen = true
      state.paymentModalMode = 'pay_overdue'
      state.paymentModalPlan = null
    },
    closePaymentModal: (state) => {
      state.paymentModalOpen = false
      state.paymentModalPlan = null
    },
  },
})

export const { openPaymentModal, openPayOverdueModal, closePaymentModal } = billingSlice.actions
export default billingSlice.reducer
