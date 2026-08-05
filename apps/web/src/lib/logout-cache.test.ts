import { describe, expect, it } from 'vitest'
import { api } from '../services/api'

describe('logout RTK cache hygiene', () => {
  it('resetApiState produces the RTK Query reset action used on logout', () => {
    const action = api.util.resetApiState()
    expect(action.type).toBe('api/resetApiState')
  })
})
