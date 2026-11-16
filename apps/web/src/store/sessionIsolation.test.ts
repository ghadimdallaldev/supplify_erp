import { afterEach, describe, expect, it, vi } from 'vitest'
import { store } from './index'
import { api } from '../services/api'
import { clearUser, setUser } from '../features/auth/authSlice'
import type { User } from '../types'

afterEach(() => {
  store.dispatch(clearUser())
  store.dispatch(api.util.resetApiState())
  vi.unstubAllGlobals()
})
describe('access changes during pending requests', () => {
  it('discards a late warehouse response from the previous access scope', async () => {
    const user = {
      id: 'a',
      email: 'a@example.com',
      displayName: 'A',
      role: 'SUPPLIER',
      createdAt: '2026-11-16',
      tenantPermissions: ['WAREHOUSES_VIEW'],
      warehouseAccess: { mode: 'all', warehouseIds: [] },
    } as User
    store.dispatch(setUser(user))
    let finish!: (response: Response) => void
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    vi.stubGlobal('fetch', fetch)
    const request = store.dispatch(api.endpoints.getWarehouses.initiate())
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    store.dispatch(
      setUser({ ...user, warehouseAccess: { mode: 'assigned', warehouseIds: ['allowed-a'] } })
    )
    finish(
      new Response(
        JSON.stringify({
          ok: true,
          data: { warehouses: [{ id: 'private-b', name: 'Private B' }] },
        }),
        { headers: { 'content-type': 'application/json' } }
      )
    )
    await request
    expect(api.endpoints.getWarehouses.select()(store.getState()).data).toBeUndefined()
    expect(store.getState().auth.user?.warehouseAccess?.mode).toBe('assigned')
  })
})
