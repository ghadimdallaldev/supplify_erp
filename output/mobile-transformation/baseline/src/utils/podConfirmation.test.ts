import { confirmDeliveryWithProof } from './podConfirmation'

describe('confirmDeliveryWithProof', () => {
  // The API rejects `delivered` with 400 when the supplier requires proof of delivery
  // and none is on file yet, so the proof must be persisted before the status flips.
  it('submits the proof before marking the order delivered', async () => {
    const calls: string[] = []
    await confirmDeliveryWithProof({
      submitProof: async () => {
        calls.push('proof')
      },
      markDelivered: async () => {
        calls.push('delivered')
      },
    })
    expect(calls).toEqual(['proof', 'delivered'])
  })

  it('does not mark the order delivered when the proof fails to save', async () => {
    const markDelivered = jest.fn(async () => {})
    await expect(
      confirmDeliveryWithProof({
        submitProof: async () => {
          throw new Error('upload rejected')
        },
        markDelivered,
      })
    ).rejects.toThrow('upload rejected')
    expect(markDelivered).not.toHaveBeenCalled()
  })

  it('surfaces a delivered-step failure while keeping the saved proof', async () => {
    const submitProof = jest.fn(async () => {})
    await expect(
      confirmDeliveryWithProof({
        submitProof,
        markDelivered: async () => {
          throw new Error('Cannot mark order delivered from PROCESSING')
        },
      })
    ).rejects.toThrow(/Cannot mark order delivered/)
    // Proof stays on file so the driver can retry the status without re-uploading.
    expect(submitProof).toHaveBeenCalledTimes(1)
  })
})
