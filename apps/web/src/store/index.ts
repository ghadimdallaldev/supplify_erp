import { configureStore } from '@reduxjs/toolkit'
import { api } from '../services/api'
import authReducer from '../features/auth/authSlice'
import cartReducer from '../features/cart/cartSlice'
import monetizationReducer from '../features/monetization/monetizationSlice'
import billingReducer from '../features/billing/billingSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    monetization: monetizationReducer,
    billing: billingReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
