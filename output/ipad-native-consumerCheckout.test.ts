import {api} from './client'
import {createPublicConsumerOrder} from './consumerCheckout'
jest.mock('./client',()=>({api:{post:jest.fn()}}))
it('preserves a diner checkout key and payload across client retries',async()=>{
  const payload={idempotencyKey:'a38c96b3-83c4-44a9-bc09-6f883332e9a4',branchId:'b1',fulfillmentType:'TAKEAWAY' as const,guestName:'Guest',lines:[{menuItemId:'dish1',quantity:1}]}
  ;(api.post as jest.Mock).mockResolvedValue({receiptToken:'receipt1'})
  await createPublicConsumerOrder('qa-bistro',payload)
  await createPublicConsumerOrder('qa-bistro',payload)
  expect(api.post).toHaveBeenNthCalledWith(1,'/api/public/consumer/qa-bistro/orders',payload)
  expect(api.post).toHaveBeenNthCalledWith(2,'/api/public/consumer/qa-bistro/orders',payload)
})
