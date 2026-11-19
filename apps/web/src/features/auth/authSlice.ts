import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { User } from '../../types'
import { businessSessionKey } from '../../lib/businessSession'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  contextVersion: number
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  contextVersion: 0,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      if (businessSessionKey(state.user) !== businessSessionKey(action.payload))
        state.contextVersion++
      state.user = action.payload
      state.isAuthenticated = true
      state.isLoading = false
    },
    clearUser: (state) => {
      state.contextVersion++
      state.user = null
      state.isAuthenticated = false
      state.isLoading = false
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
  },
})

export const { setUser, clearUser, setLoading } = authSlice.actions
export default authSlice.reducer
