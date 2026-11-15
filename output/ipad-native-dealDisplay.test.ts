import { activeDealDiscountLabel, unwrapActiveDeals } from './dealDisplay'
describe('restaurant deals API parity', () => {
  it('displays the real promotion type and numeric-string discount from PostgreSQL', () => {
    expect(activeDealDiscountLabel({id:'d1',name:'Flour',type:'percentage_discount',discount_value:'10.00'})).toBe('10% off')
    expect(activeDealDiscountLabel({id:'d2',name:'Delivery',type:'free_shipping'})).toBe('Free delivery')
  })
  it('accepts organic and sponsored offers and distinguishes load failure from no offers', () => {
    const promotions=[{id:'organic',name:'Flour',is_sponsored:false},{id:'paid',name:'Oil',is_sponsored:true}]
    expect(unwrapActiveDeals({promotions})).toEqual(promotions)
    expect(unwrapActiveDeals({promotions:[]})).toEqual([])
    expect(()=>unwrapActiveDeals({})).toThrow('Unable to load supplier deals')
  })
})
