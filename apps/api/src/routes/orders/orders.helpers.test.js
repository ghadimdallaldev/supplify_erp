import { describe, expect, it } from 'vitest'
import { orderListSchema } from './orders.helpers.js'

describe('orderListSchema includeItems default', () => {
  it('defaults includeItems to false when omitted', () => {
    const parsed = orderListSchema.parse({})
    expect(parsed.includeItems).toBe(false)
  })

  it('parses includeItems=true when explicitly requested', () => {
    const parsed = orderListSchema.parse({ includeItems: 'true' })
    expect(parsed.includeItems).toBe(true)
  })

  it('parses includeItems=false when explicitly false', () => {
    const parsed = orderListSchema.parse({ includeItems: 'false' })
    expect(parsed.includeItems).toBe(false)
  })
})
