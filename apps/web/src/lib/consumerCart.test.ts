import { describe, expect, it } from 'vitest'
import { priceCartAgainstMenu, type CartLine } from './consumerCart'

const line: CartLine = {
  cartKey: 'item-1|opt-1|',
  menuItemId: 'item-1',
  name: 'Burger',
  unitPrice: 10,
  quantity: 2,
  modifierOptionIds: ['opt-1'],
}

describe('priceCartAgainstMenu', () => {
  it('uses the current menu price, including modifier changes', () => {
    const priced = priceCartAgainstMenu(
      [line],
      [
        {
          items: [
            {
              id: 'item-1',
              name: 'Burger',
              base_price: 12,
              is_available: true,
              modifierGroups: [{ options: [{ id: 'opt-1', price_delta: 1.5 }] }],
            },
          ],
        },
      ]
    )
    expect(priced?.lines[0].unitPrice).toBe(13.5)
    expect(priced?.priceChanged).toBe(true)
    expect(priced?.unavailable).toEqual([])
  })

  it('marks a sold-out dish or a removed modifier as unavailable', () => {
    const priced = priceCartAgainstMenu(
      [line],
      [
        {
          items: [
            { id: 'item-1', name: 'Burger', base_price: 12, modifierGroups: [{ options: [] }] },
          ],
        },
      ]
    )
    expect(priced?.unavailable).toHaveLength(1)
  })
})
