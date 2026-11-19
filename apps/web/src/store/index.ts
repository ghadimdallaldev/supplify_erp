import {
  configureStore,
  type Middleware,
  type ThunkDispatch,
  type UnknownAction,
} from '@reduxjs/toolkit'
import { api } from '../services/api'
import authReducer from '../features/auth/authSlice'
import cartReducer from '../features/cart/cartSlice'
import monetizationReducer from '../features/monetization/monetizationSlice'
import billingReducer from '../features/billing/billingSlice'
import { businessSessionKey } from '../lib/businessSession'
import { resetBusinessCart } from '../features/cart/cartSlice'
import { setUser, clearUser } from '../features/auth/authSlice'
import { setCartBusinessScope } from '../features/cart/cartPersistence'
import { releaseAppSocket } from '../lib/appSocket'

const isolateBusinessSession: Middleware =
  ({ getState, dispatch }) =>
  (next) =>
  (action) => {
    const before = businessSessionKey(getState().auth.user)
    const result = next(action)
    if (
      (setUser.match(action) || clearUser.match(action)) &&
      before !== businessSessionKey(getState().auth.user)
    ) {
      setCartBusinessScope(businessSessionKey(getState().auth.user))
      releaseAppSocket()
      const run = dispatch as ThunkDispatch<any, unknown, UnknownAction>
      const pending = [
        ...run(api.util.getRunningQueriesThunk()),
        ...run(api.util.getRunningMutationsThunk()),
      ]
      for (const request of pending) request.abort()
      dispatch(api.util.resetApiState())
      dispatch(resetBusinessCart())
    }
    return result
  }

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    monetization: monetizationReducer,
    billing: billingReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(isolateBusinessSession, api.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
