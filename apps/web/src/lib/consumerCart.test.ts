import { describe, expect, it } from 'vitest'
import {
  priceCartAgainstMenu,
  saveCart,
  loadCart,
  clearCartStorage,
  type CartLine,
} from './consumerCart'
import { vi } from 'vitest'

const line: CartLine = {
  cartKey: 'item-1|opt-1|',
  menuItemId: 'item-1',
  name: 'Burger',
  unitPrice: 10,
  quantity: 2,
  modifierOptionIds: ['opt-1'],
}

describe('priceCartAgainstMenu', () => {
  it('reads the session copy even when Safari denies persistent storage and migration', () => {
    sessionStorage.setItem('consumer-cart:qa', JSON.stringify([line]))
    const originalGet = Storage.prototype.getItem
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string
    ) {
      if (this === localStorage) throw new Error('Denied')
      return originalGet.call(this, key)
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Denied')
    })
    expect(loadCart('qa')).toEqual([line])
    get.mockRestore()
    set.mockRestore()
    sessionStorage.clear()
  })
  it('blocks a stored item when the restaurant adds a required choice or reduces the selection limit', () => {
    const categories = [
      {
        items: [
          {
            id: 'item-1',
            name: 'Burger',
            base_price: 12,
            modifierGroups: [
              {
                is_required: true,
                min_selections: 1,
                max_selections: 1,
                options: [{ id: 'new-required', price_delta: 0 }],
              },
            ],
          },
        ],
      },
    ]
    expect(priceCartAgainstMenu([line], categories)?.unavailable).toHaveLength(1)
    expect(
      priceCartAgainstMenu(
        [{ ...line, modifierOptionIds: ['new-required', 'new-required'] }],
        categories
      )?.unavailable
    ).toHaveLength(1)
  })
  it('keeps cart mutations usable when Safari storage is denied', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Storage denied')
    })
    expect(() => saveCart('qa', [line])).not.toThrow()
    expect(() => clearCartStorage('qa')).not.toThrow()
    set.mockRestore()
    remove.mockRestore()
  })
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
