import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()
const clientQueryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (fn) => fn({ query: (...args) => clientQueryMock(...args) }),
}))

describe('pick-lists.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMock.mockReset()
    clientQueryMock.mockReset()
  })

  it('lists waves for supplier date', async () => {
    const { listWaves } = await import('./pick-lists.service.js')
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'w1',
          wave_number: 'W-20260617-001',
          scheduled_date: '2026-06-17',
          status: 'PICKING',
          pick_list_count: 2,
          order_count: 2,
          item_count: 5,
          items_picked: 1,
          created_at: '2026-06-17T08:00:00Z',
        },
      ],
    })

    const waves = await listWaves('s1', '2026-06-17')
    expect(waves).toHaveLength(1)
    expect(waves[0].waveNumber).toBe('W-20260617-001')
    expect(waves[0].itemCount).toBe(5)
  })

  it('rejects generateWave when no eligible orders', async () => {
    const { generateWave } = await import('./pick-lists.service.js')
    queryMock.mockResolvedValueOnce({ rows: [] })

    await expect(generateWave('s1', { date: '2026-06-17' })).rejects.toThrow(/no eligible orders/i)
  })

  it('generates wave with pick lists for explicit order ids', async () => {
    const { generateWave } = await import('./pick-lists.service.js')
    const orderId = '11111111-1111-4111-8111-111111111111'

    queryMock.mockResolvedValueOnce({ rows: [{ id: orderId }] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'oi1',
          product_id: 'p1',
          quantity: 4,
          warehouse_id: 'wh1',
        },
      ],
    })

    clientQueryMock
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'w1',
            wave_number: 'W-20260617-001',
            scheduled_date: '2026-06-17',
            status: 'PICKING',
            created_at: '2026-06-17T08:00:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'pl1', order_id: orderId, warehouse_id: 'wh1', status: 'PENDING' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pl1',
            order_id: orderId,
            warehouse_id: 'wh1',
            status: 'PENDING',
            restaurant_name: 'Cafe',
            warehouse_name: 'Main',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pli1',
            pick_list_id: 'pl1',
            product_id: 'p1',
            order_item_id: 'oi1',
            quantity_ordered: 4,
            quantity_picked: null,
            location_code: null,
            notes: null,
            product_name: 'Rice',
            product_sku: 'RICE-1',
          },
        ],
      })

    const wave = await generateWave('s1', { date: '2026-06-17', orderIds: [orderId] })
    expect(wave.waveNumber).toBe('W-20260617-001')
    expect(wave.pickLists).toHaveLength(1)
    expect(wave.pickLists[0].items).toHaveLength(1)
    expect(wave.pickLists[0].items[0].productName).toBe('Rice')
  })

  it('updates pick list item quantity', async () => {
    const { updatePickListItem } = await import('./pick-lists.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pl1',
            wave_id: 'w1',
            status: 'PENDING',
            wave_status: 'PICKING',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'pli1', quantity_ordered: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pli1',
            pick_list_id: 'pl1',
            product_id: 'p1',
            order_item_id: 'oi1',
            quantity_ordered: 5,
            quantity_picked: 4,
            location_code: null,
            notes: 'short',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ product_name: 'Rice', product_sku: 'RICE-1' }],
      })

    const item = await updatePickListItem('s1', 'pl1', 'pli1', {
      quantityPicked: 4,
      notes: 'short',
    })
    expect(item.quantityPicked).toBe(4)
    expect(item.notes).toBe('short')
  })

  it('rejects completeWave when items remain unpicked', async () => {
    const { completeWave } = await import('./pick-lists.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'w1', supplier_id: 's1', status: 'PICKING' }],
      })
      .mockResolvedValueOnce({ rows: [{ n: 2 }] })

    await expect(completeWave('w1', 's1')).rejects.toThrow(/picked quantity/i)
  })

  it('completes wave when all lines are picked', async () => {
    const { completeWave } = await import('./pick-lists.service.js')

    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'w1', supplier_id: 's1', status: 'PICKING', wave_number: 'W-1' }],
      })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })

    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'w1',
            wave_number: 'W-1',
            scheduled_date: '2026-06-17',
            status: 'PICKED',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })

    const wave = await completeWave('w1', 's1')
    expect(wave.status).toBe('PICKED')
  })
})
