import { describe, expect, it } from 'vitest'
import { lookupTableAssignment, normalizeTableId, reservationTableIds } from './reservation-tables'

describe('reservationTableIds', () => {
  it('parses uuid arrays and postgres string form', () => {
    const id = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890'
    expect(
      reservationTableIds({
        tables: [`{${id}}`],
      })
    ).toEqual([normalizeTableId(id)])
    expect(
      reservationTableIds({
        tables: `{${id}}`,
      })
    ).toEqual([normalizeTableId(id)])
    expect(
      reservationTableIds({
        tables: [id],
      })
    ).toEqual([normalizeTableId(id)])
  })

  it('lookupTableAssignment matches case-insensitively', () => {
    const map = new Map([
      [normalizeTableId('A1B2C3D4-E5F6-7890-ABCD-EF1234567890'), { guest: true }],
    ])
    expect(lookupTableAssignment(map, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toEqual({
      guest: true,
    })
  })
})
