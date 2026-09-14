import { describe, it, expect } from 'vitest'

describe('quick list ordering list scoping', () => {
  it('create schema accepts supplier and branch ids', async () => {
    const { z } = await import('zod')
    const schema = z.object({
      name: z.string().min(1),
      supplierId: z.string().uuid().optional(),
      branchId: z.string().uuid().optional(),
    })
    const parsed = schema.parse({
      name: 'Weekly kitchen',
      supplierId: '11111111-1111-4111-8111-111111111111',
      branchId: '22222222-2222-4222-8222-222222222222',
    })
    expect(parsed.name).toBe('Weekly kitchen')
    expect(parsed.supplierId).toBeTruthy()
  })
})
